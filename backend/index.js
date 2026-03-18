const express = require("express");
const cors = require("cors");
const multer = require("multer");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const OpenAI = require("openai");
const { PDFParse } = require("pdf-parse");
const { createWorker } = require("tesseract.js");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

function fetchWithTimeout(url, options, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
}
const MIN_TEXT_LENGTH_BEFORE_OCR = 400;

// OCR tuning: image PDFs are slow, so we cap work and cache results.
// Defaults chosen to extract more biomarkers while staying reasonably fast.
const OCR_MAX_PAGES = Number(process.env.OCR_MAX_PAGES || 8); // render+OCR only first N pages
const OCR_SCALE = Number(process.env.OCR_SCALE || 1.35); // higher = better OCR, slower
const OCR_DESIRED_WIDTH = Number(process.env.OCR_DESIRED_WIDTH || 1100); // px
const OCR_LANG = process.env.OCR_LANG || "eng";
const OCR_TEXT_MAX_CHARS = Number(process.env.OCR_TEXT_MAX_CHARS || 50000);
const OCR_CACHE_DIR = path.join(__dirname, "reports", ".ocr_cache");
const BIOMARKER_CACHE_DIR = path.join(
  __dirname,
  "reports",
  ".biomarker_cache"
);
const BIOMARKER_EXPLAIN_CACHE_DIR = path.join(
  __dirname,
  "reports",
  ".biomarker_explain_cache"
);
const BIOMARKER_PERSONAL_INSIGHT_CACHE_DIR = path.join(
  __dirname,
  "reports",
  ".biomarker_personal_insight_cache"
);

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })
);
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

// In-memory store for quick demo; database for persistence.
const reports = new Map();
let latestReportId = null;
// Mock multi-report generation for trends visualization (in-memory only).
const mockReports = new Map(); // id -> report
let latestMockReportId = null;
const products = [
  {
    id: "vitamin-d",
    name: "Vitamin D3 2000 IU",
    category: "supplement",
    biomarker: "Vitamin D",
    retailer: "Example Retailer",
    url: "https://example-retailer.com/vitamin-d3",
  },
  {
    id: "omega-3",
    name: "Omega-3 Fish Oil",
    category: "supplement",
    biomarker: "Triglycerides",
    retailer: "Example Retailer",
    url: "https://example-retailer.com/omega-3",
  },
];

// Optional Postgres client (Railway / Vercel)
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl
  ? new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  })
  : null;

// Optional OpenAI client for real LLM insights
const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey
  ? new OpenAI({
    apiKey: openaiApiKey,
  })
  : null;

async function recommendProductsWithLLM(insights) {
  if (!openai || !insights) return null;

  const relevantKeyFindings = (insights.keyFindings || []).filter(
    (k) => k.status === "low" || k.status === "borderline-high"
  );
  if (relevantKeyFindings.length === 0) return [];

  const systemPrompt =
    "You recommend over-the-counter products (supplements, devices, books, apps) " +
    "that can help people improve biomarkers from a blood test. " +
    "Respond in strict JSON only. You are not a doctor and you do not prescribe medications. " +
    "For each key finding, suggest 1–2 generic, non-brand-specific product ideas with a rationale. " +
    "Output an object { products: [{ biomarker, name, category, searchKeyword, rationale }] }. " +
    "Keep names generic (e.g. 'Vitamin D3 2000 IU supplement') and avoid brand or store names. " +
    "searchKeyword must be a short keyword phrase suitable for Canopy API (/api/amazon/search searchTerm) (e.g. 'Vitamin D3 2000 IU supplement').";

  const userContent = {
    keyFindings: relevantKeyFindings,
    lifestyleRecommendations: insights.lifestyleRecommendations,
  };

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Based on these key findings from a lab report, suggest relevant generic products.\n\n" +
          JSON.stringify(userContent),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.products)) {
    return null;
  }
  return parsed.products;
}

function canopyConfigReady() {
  return Boolean(process.env.CANOPY_API_KEY);
}

async function searchCanopyProductsByKeyword({
  keywords,
  itemCount = 1,
  biomarker,
  category,
}) {
  // Reload env on each request so adding CANOPY_API_KEY doesn't require a restart.
  dotenv.config({ override: true });

  if (!canopyConfigReady() || !keywords) return [];

  const baseUrl = process.env.CANOPY_BASE_URL || "https://rest.canopyapi.co";
  const domain = process.env.CANOPY_DOMAIN || "US";

  const endpoint = `${baseUrl}/api/amazon/search?searchTerm=${encodeURIComponent(
    keywords
  )}&domain=${encodeURIComponent(domain)}&limit=${encodeURIComponent(
    itemCount
  )}`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        "API-KEY": process.env.CANOPY_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) return [];

    const json = await response.json().catch(() => null);
    const results =
      json?.data?.amazonProductSearchResults?.productResults?.results || [];

    if (!Array.isArray(results) || results.length === 0) return [];

    return results
      .filter((r) => r && r.url)
      .slice(0, itemCount)
      .map((r) => ({
        id: r.asin ? `amz_${r.asin}` : `canopy_${Buffer.from(r.title || keywords).toString("hex")}`,
        name: r.title || keywords,
        biomarker: biomarker || "",
        category: category || "supplement",
        retailer: "Amazon",
        url: r.url,
      }));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Canopy search failed", err);
    return [];
  }
}

async function persistReportToDb(report) {
  if (!pool) return;

  const sampleUserId = "sample-user-1";
  const text = `
    INSERT INTO reports (user_id, provider, age, sex, biomarkers, created_at)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `;
  const values = [
    sampleUserId,
    report.provider,
    report.age,
    report.sex,
    report.biomarkers || null,
    report.createdAt,
  ];

  try {
    const result = await pool.query(text, values);
    return result.rows[0]?.id;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to persist report to DB", err);
    return null;
  }
}

async function getLatestDbReport() {
  if (!pool) return null;
  const sampleUserId = "sample-user-1";
  const text = `
    SELECT id, user_id, provider, age, sex, biomarkers, created_at
    FROM reports
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT 1
  `;
  try {
    const result = await pool.query(text, [sampleUserId]);
    if (!result.rows.length) return null;
    return result.rows[0];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to load latest report from DB", err);
    return null;
  }
}

async function getDbReportById(id) {
  if (!pool) return null;
  const text = `
    SELECT id, user_id, provider, age, sex, biomarkers, created_at
    FROM reports
    WHERE id = $1
    LIMIT 1
  `;
  try {
    const result = await pool.query(text, [id]);
    if (!result.rows.length) return null;
    return result.rows[0];
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to load report from DB", err);
    return null;
  }
}

async function extractTextFromReportFile(fileBuffer, mimeType) {
  if (!fileBuffer) return null;

  if (mimeType !== "application/pdf") return null;

  try {
    const parser = new PDFParse({ data: fileBuffer });
    const result = await parser.getText();
    let text = result?.text?.trim() ?? "";

    if (text.length >= MIN_TEXT_LENGTH_BEFORE_OCR) {
      await parser.destroy();
      return text || null;
    }

    // Image PDF: little or no text layer — use OCR
    // eslint-disable-next-line no-console
    console.log("[PDF] Text layer short (" + text.length + " chars), running OCR on page images...");
    // Include OCR settings in the cache key so tuning OCR actually changes results.
    const cacheKey = crypto
      .createHash("md5")
      .update(fileBuffer)
      .update(
        `|OCR_MAX_PAGES=${OCR_MAX_PAGES}|OCR_SCALE=${OCR_SCALE}|OCR_DESIRED_WIDTH=${OCR_DESIRED_WIDTH}|OCR_LANG=${OCR_LANG}|TESS_PSM=6`
      )
      .digest("hex");
    const cachePath = path.join(OCR_CACHE_DIR, `${cacheKey}.txt`);
    if (fs.existsSync(cachePath)) {
      // eslint-disable-next-line no-console
      console.log("[PDF] Using cached OCR text");
      await parser.destroy();
      const cached = fs.readFileSync(cachePath, "utf8");
      return cached || null;
    }

    if (!fs.existsSync(OCR_CACHE_DIR)) {
      fs.mkdirSync(OCR_CACHE_DIR, { recursive: true });
    }

    let screenshotResult;
    try {
      screenshotResult = await parser.getScreenshot({
        scale: OCR_SCALE,
        desiredWidth: OCR_DESIRED_WIDTH,
        imageBuffer: true,
        // limit rendering to speed up OCR
        first: OCR_MAX_PAGES,
      });
    } finally {
      await parser.destroy();
    }

    if (!screenshotResult?.pages?.length) return text || null;

    const worker = await createWorker(OCR_LANG);
    try {
      // Improve OCR speed/consistency for dense documents.
      // eslint-disable-next-line no-console
      await worker.setParameters({ tessedit_pageseg_mode: "6" });
      const ocrParts = [];
      for (let i = 0; i < screenshotResult.pages.length; i++) {
        const page = screenshotResult.pages[i];
        const buf = page?.data ?? page?.buffer;
        if (!buf) continue;
        const { data: ocrData } = await worker.recognize(Buffer.from(buf));
        if (ocrData?.text) ocrParts.push(ocrData.text.trim());
      }
      const ocrText = ocrParts.join("\n\n");
      if (ocrText.length > text.length) text = ocrText;
    } finally {
      await worker.terminate();
    }

    if (text) {
      // Keep LLM input manageable and cache the result.
      const finalText = text.length > OCR_TEXT_MAX_CHARS ? text.slice(0, OCR_TEXT_MAX_CHARS) : text;
      fs.writeFileSync(cachePath, finalText, "utf8");
      return finalText || null;
    }

    return null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to parse PDF", err);
    return null;
  }
}

async function extractBiomarkersWithLLM(rawText) {
  if (!openai || !rawText) return null;

  const systemPrompt =
    "You convert raw lab report text into structured biomarker data. " +
    "Respond in strict JSON only. Each biomarker should have: name, value, unit, " +
    "status (low/normal/high/borderline), and optional referenceRange string.";

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "From the following report text, extract an array `biomarkers` where each element is " +
          "{ name, value, unit, status, referenceRange? }. Only include clinically relevant markers.\n\n" +
          rawText.slice(0, 50000),
      },
    ],
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const arr = parsed?.biomarkers ?? parsed?.markers ?? (Array.isArray(parsed) ? parsed : null);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr;
}

const DATA_PAGE_CATEGORIES = [
  "summary", "heart", "metabolic", "sex", "thyroid", "inflammation",
  "liver", "kidney", "nutrients", "energy", "immune", "dna", "brain", "gut", "toxin",
];

function normalizeCategory(cat) {
  if (!cat || typeof cat !== "string") return "summary";
  const c = cat.toLowerCase().trim();
  if (DATA_PAGE_CATEGORIES.includes(c)) return c;
  const map = {
    cardiovascular: "heart", cardio: "heart", lipids: "heart",
    metabolism: "metabolic", glucose: "metabolic", insulin: "metabolic", a1c: "metabolic",
    hormones: "sex", testosterone: "sex", estrogen: "sex",
    tsh: "thyroid", t3: "thyroid", t4: "thyroid",
    crp: "inflammation", inflammatory: "inflammation",
    alt: "liver", ast: "liver", ggt: "liver", liver: "liver",
    creatinine: "kidney", egfr: "kidney", kidney: "kidney", gfr: "kidney",
    vitamin: "nutrients", nutrients: "nutrients", b12: "nutrients", folate: "nutrients", iron: "nutrients",
    immune: "immune", infection: "immune",
    brain: "brain", mood: "brain", b12: "nutrients",
    gut: "gut", digestion: "gut",
    toxin: "toxin", heavy: "toxin",
  };
  for (const [k, v] of Object.entries(map)) {
    if (c.includes(k)) return v;
  }
  return "summary";
}

function normalizeBiomarker(b) {
  const name = b.name || b.Name || "Unknown";
  const value = typeof b.value === "number" ? b.value : parseFloat(b.value);
  const unit = b.unit || b.Unit || "";
  const rawStatus = (b.status || b.Status || "normal").toString().toLowerCase();
  // Normalize to the small set the UI expects.
  let status = "normal";
  if (rawStatus.includes("borderline")) status = "borderline";
  else if (rawStatus.includes("low")) status = "low";
  else if (rawStatus.includes("high")) status = "high";
  else if (rawStatus.includes("normal")) status = "normal";
  const referenceRange = b.referenceRange ?? b.reference_range ?? "";
  const refMin = b.refMin ?? b.ref_min ?? (typeof b.refMin === "number" ? b.refMin : null);
  const refMax = b.refMax ?? b.ref_max ?? (typeof b.refMax === "number" ? b.refMax : null);
  const category = normalizeCategory(b.category || b.Category);
  return {
    name,
    value: Number.isFinite(value) ? value : 0,
    unit,
    status,
    referenceRange: String(referenceRange),
    refMin: refMin != null && Number.isFinite(Number(refMin)) ? Number(refMin) : null,
    refMax: refMax != null && Number.isFinite(Number(refMax)) ? Number(refMax) : null,
    category,
  };
}

function categoryFromBiomarkerName(name) {
  const n = (name || "").toLowerCase();
  if (/\b(ldl|hdl|cholesterol|triglyceride|apo|lipoprotein)\b/.test(n)) return "heart";
  if (/\b(glucose|a1c|insulin|hba1c)\b/.test(n)) return "metabolic";
  if (/\b(vitamin d|b12|folate|iron|ferritin|magnesium|zinc)\b/.test(n)) return "nutrients";
  if (/\b(alt|ast|ggt|alp|bilirubin)\b/.test(n)) return "liver";
  if (/\b(creatinine|egfr|gfr|bun)\b/.test(n)) return "kidney";
  if (/\b(tsh|t3|t4|thyroid)\b/.test(n)) return "thyroid";
  if (/\b(crp|hs-crp|inflammatory)\b/.test(n)) return "inflammation";
  return "summary";
}

function parseRefRange(referenceRange) {
  if (!referenceRange || typeof referenceRange !== "string") return { refMin: null, refMax: null };
  const match = referenceRange.match(/(\d+\.?\d*)\s*[-–—to]+\s*(\d+\.?\d*)/i);
  if (match) {
    const a = parseFloat(match[1]);
    const b = parseFloat(match[2]);
    return { refMin: Math.min(a, b), refMax: Math.max(a, b) };
  }
  return { refMin: null, refMax: null };
}

async function extractBiomarkersFromReportsDir() {
  const reportsDir = path.join(__dirname, "reports");
  if (!fs.existsSync(reportsDir)) {
    return { text: null, fileCount: 0 };
  }
  const files = fs.readdirSync(reportsDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  let fullText = "";
  for (const file of files) {
    const filePath = path.join(reportsDir, file);
    const buffer = fs.readFileSync(filePath);
    const text = await extractTextFromReportFile(buffer, "application/pdf");
    if (text) fullText += `\n\n--- ${file} ---\n\n` + text;
  }
  return { text: fullText.trim() || null, fileCount: files.length };
}

async function extractBiomarkersWithLLMForDataPage(rawText) {
  if (!openai || !rawText) return null;

  const systemPrompt =
    "You convert raw lab report text into structured biomarker data for a health dashboard. " +
    "Respond in strict JSON only. " +
    "Each biomarker must have: name, value (number), unit, status (one of: low, normal, high, borderline), " +
    "referenceRange (string, e.g. '30-100 ng/mL' or '4.5-5.5'), refMin (number or null), refMax (number or null). " +
    "Also include category: exactly one of " + DATA_PAGE_CATEGORIES.join(", ") + " — map each biomarker to the most relevant health section (e.g. LDL to heart, Vitamin D to nutrients, ALT to liver, creatinine to kidney, glucose to metabolic, TSH to thyroid). " +
    "Include EVERY biomarker you can find with a numeric value and unit. If reference ranges are present, fill referenceRange, refMin, refMax. " +
    "If the text indicates borderline, set status to 'borderline' (not 'borderline-high'). " +
    "Use refMin/refMax when the reference range is numeric so a UI can draw a zone slider; use null if not applicable.";

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "From the following report text, extract an array `biomarkers` where each element has: " +
          "name, value, unit, status, referenceRange, refMin, refMax, category. " +
          "Extract as many biomarkers as possible. Use the exact category strings from the list.\n\n" +
          rawText.slice(0, 55000),
      },
    ],
  });

  let raw = completion.choices[0]?.message?.content || "{}";
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const arr = parsed?.biomarkers ?? parsed?.markers ?? (Array.isArray(parsed) ? parsed : null);
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const normalized = arr.map(normalizeBiomarker);
  // De-dupe by biomarker identity so we show unique markers in the UI.
  // If duplicates exist, keep the last occurrence (LLM may repeat across pages).
  const seen = new Map(); // key -> biomarker
  for (const b of normalized) {
    const key = `${(b.name || "").toLowerCase().trim()}|${(b.unit || "").toLowerCase().trim()}`;
    seen.set(key, b);
  }
  return Array.from(seen.values());
}

async function generateInsightsWithLLM(report) {
  // Fallback to mocked insights if OpenAI is not configured.
  if (!openai) {
    return null;
  }

  const systemPrompt =
    "You are a clinician-grade assistant that interprets blood test reports. " +
    "You must respond in strict JSON only. Summarize key findings, flag low or high biomarkers, " +
    "describe trends, and provide concrete lifestyle recommendations. Do not mention that you are an AI.";

  const userContent = {
    reportMeta: {
      age: report.age,
      sex: report.sex,
      provider: report.provider,
      createdAt: report.createdAt,
    },
    biomarkers: report.biomarkers,
  };

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          "Here is a structured representation of a lab report. " +
          "Return JSON with fields: summary (string), keyFindings (array of { biomarker, status, message }), " +
          "biomarkerTrends (array of { biomarker, unit, points: { date, value }[] }), " +
          "lifestyleRecommendations (array of strings).\n\n" +
          JSON.stringify(userContent),
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  return JSON.parse(raw);
}

// Basic health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// List recent reports for the current (sample) user
app.get("/api/reports", async (_req, res) => {
  if (pool) {
    const sampleUserId = "sample-user-1";
    const text = `
      SELECT id, provider, age, sex, created_at
      FROM reports
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;
    try {
      const result = await pool.query(text, [sampleUserId]);
      return res.json({ reports: result.rows });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to list reports from DB", err);
      return res.status(500).json({ error: "Failed to list reports" });
    }
  }

  const list = Array.from(reports.values()).map((r) => ({
    id: r.id,
    provider: r.provider,
    age: r.age,
    sex: r.sex,
    createdAt: r.createdAt,
  }));
  res.json({ reports: list });
});

// Upload a report file or JSON payload
app.post(
  "/api/reports",
  upload.single("reportFile"),
  async (req, res) => {
    try {
      const { age, sex, provider, metadata, biomarkersJson, biomarkers } =
        req.body;

      const id = `r_${Date.now()}`;

      let parsedBiomarkers = null;
      if (biomarkersJson) {
        try {
          parsedBiomarkers = JSON.parse(biomarkersJson);
        } catch {
          return res.status(400).json({ error: "Invalid biomarkersJson" });
        }
      } else if (biomarkers) {
        // Allow sending biomarkers directly as JSON in a pure JSON body.
        if (typeof biomarkers === "string") {
          try {
            parsedBiomarkers = JSON.parse(biomarkers);
          } catch {
            return res.status(400).json({ error: "Invalid biomarkers" });
          }
        } else {
          parsedBiomarkers = biomarkers;
        }
      } else if (req.file) {
        // If a file is uploaded and no structured biomarkers are provided,
        // try to parse the file and let the LLM extract markers.
        const rawText = await extractTextFromReportFile(
          req.file.buffer,
          req.file.mimetype
        );
        if (rawText) {
          try {
            const extracted = await extractBiomarkersWithLLM(rawText);
            if (Array.isArray(extracted) && extracted.length > 0) {
              parsedBiomarkers = extracted;
            }
          } catch (err) {
            // eslint-disable-next-line no-console
            console.error("Failed to extract biomarkers via LLM", err);
          }
        }
      }

      let parsedMetadata = {};
      if (metadata) {
        try {
          parsedMetadata =
            typeof metadata === "string" ? JSON.parse(metadata) : metadata;
        } catch {
          return res.status(400).json({ error: "Invalid metadata" });
        }
      }

      const report = {
        age: age ? Number(age) : null,
        sex: sex || null,
        provider: provider || null,
        metadata: parsedMetadata,
        createdAt: new Date().toISOString(),
        // In a real app, you'd parse the PDF/CSV and extract markers.
        biomarkers: parsedBiomarkers,
        rawFile: req.file
          ? {
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
          }
          : null,
      };

      let responseReport = { ...report, id };

      // Persist to Postgres for the sample user if configured.
      if (pool) {
        const dbId = await persistReportToDb(report);
        if (dbId) {
          responseReport = { ...report, id: dbId };
        }
      } else {
        reports.set(id, report);
        latestReportId = id;
      }

      res.status(201).json({ report: responseReport });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Error uploading report", err);
      res.status(500).json({ error: "Failed to upload report" });
    }
  }
);

// Get the latest report for the current (sample) user
app.get("/api/reports/latest", async (req, res) => {
  // Prefer the database if configured.
  if (pool) {
    const row = await getLatestDbReport();
    if (!row) {
      return res.status(404).json({ error: "No reports available" });
    }
    const report = {
      id: row.id,
      age: row.age,
      sex: row.sex,
      provider: row.provider,
      metadata: {},
      createdAt: row.created_at,
      biomarkers: row.biomarkers,
      rawFile: null,
    };
    return res.json({ report });
  }

  if (!latestReportId) {
    return res.status(404).json({ error: "No reports available" });
  }
  const report = reports.get(latestReportId);
  if (!report) {
    return res.status(404).json({ error: "No reports available" });
  }
  res.json({ report });
});

// Get a single report
app.get("/api/reports/:id", async (req, res) => {
  const { id } = req.params;

  if (pool) {
    const row = await getDbReportById(id);
    if (!row) return res.status(404).json({ error: "Report not found" });
    const report = {
      id: row.id,
      age: row.age,
      sex: row.sex,
      provider: row.provider,
      metadata: {},
      createdAt: row.created_at,
      biomarkers: row.biomarkers,
      rawFile: null,
    };
    return res.json({ report });
  }

  const report = reports.get(id);
  if (!report) return res.status(404).json({ error: "Report not found" });
  res.json({ report });
});

// LLM analysis for the latest report
app.post("/api/reports/latest/analyze", async (req, res) => {
  let report;

  if (pool) {
    const row = await getLatestDbReport();
    if (!row) {
      return res.status(404).json({ error: "No reports available" });
    }
    report = {
      id: row.id,
      age: row.age,
      sex: row.sex,
      provider: row.provider,
      metadata: {},
      createdAt: row.created_at,
      biomarkers: row.biomarkers,
      rawFile: null,
    };
  } else {
    if (!latestReportId) {
      return res.status(404).json({ error: "No reports available" });
    }
    const memReport = reports.get(latestReportId);
    if (!memReport) {
      return res.status(404).json({ error: "No reports available" });
    }
    report = memReport;
  }

  let insights = null;

  try {
    insights = await generateInsightsWithLLM(report);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("LLM insights failed, falling back to mock", err);
  }

  if (!insights) {
    insights = {
      summary:
        "Overall, your biomarkers are mostly within optimal ranges with a few areas for improvement.",
      keyFindings: [
        {
          biomarker: "Vitamin D",
          status: "low",
          message:
            "Your Vitamin D level is below the optimal range, which can affect bone health, mood, and immunity.",
        },
        {
          biomarker: "LDL Cholesterol",
          status: "borderline-high",
          message:
            "Your LDL cholesterol is slightly elevated; consider dietary adjustments and activity.",
        },
      ],
      biomarkerTrends: [
        {
          biomarker: "Vitamin D",
          unit: "ng/mL",
          points: [
            { date: "2024-01-01", value: 18 },
            { date: report.createdAt.slice(0, 10), value: 22 },
          ],
        },
        {
          biomarker: "LDL Cholesterol",
          unit: "mg/dL",
          points: [
            { date: "2024-01-01", value: 145 },
            { date: report.createdAt.slice(0, 10), value: 140 },
          ],
        },
      ],
      lifestyleRecommendations: [
        "Aim for 20–30 minutes of daylight exposure daily to naturally boost Vitamin D.",
        "Incorporate 150 minutes/week of moderate cardio such as brisk walking or cycling.",
        "Prioritize fiber-rich foods (oats, legumes, vegetables) to support cholesterol balance.",
      ],
    };
  }

  const relevantFindings = (insights.keyFindings || []).filter(
    (k) => k.status === "low" || k.status === "borderline-high"
  );

  let ideaSuggestions = [];
  try {
    const llmIdeas = await recommendProductsWithLLM(insights);
    if (Array.isArray(llmIdeas) && llmIdeas.length > 0) {
      ideaSuggestions = llmIdeas;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "Product recommendation LLM failed; falling back to simple keywords",
      err
    );
  }

  if (!ideaSuggestions.length) {
    ideaSuggestions = relevantFindings.map((k) => ({
      biomarker: k.biomarker,
      category: "supplement",
      name: `${k.biomarker} supplement`,
      searchKeyword: `${k.biomarker} supplement`,
      rationale: "",
    }));
  }

  ideaSuggestions = ideaSuggestions.slice(0, 5);

  const personalizedProducts = [];
  const seenIds = new Set();

  try {
    for (let i = 0; i < ideaSuggestions.length; i++) {
      const s = ideaSuggestions[i];
      const keyword =
        s.searchKeyword || s.name || s.biomarker || s.relatedBiomarker;
      if (!keyword) continue;

      const amazonItems = await searchCanopyProductsByKeyword({
        keywords: keyword,
        itemCount: 1,
        biomarker: s.biomarker || s.relatedBiomarker || "",
        category: s.category,
      });

      const item = amazonItems[0];
      if (item && !seenIds.has(item.id)) {
        personalizedProducts.push(item);
        seenIds.add(item.id);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Amazon product search failed; falling back to static", err);
  }

  if (personalizedProducts.length === 0) {
    personalizedProducts.push(
      ...products.filter((p) =>
        relevantFindings.some(
          (k) =>
            k.biomarker.toLowerCase() === p.biomarker.toLowerCase()
        )
      )
    );
  }

  res.json({
    reportId: report.id,
    insights,
    personalizedProducts,
  });
});

// LLM analysis for a report by ID
app.post("/api/reports/:id/analyze", async (req, res) => {
  const { id } = req.params;

  let report;

  if (pool) {
    const row = await getDbReportById(id);
    if (!row) return res.status(404).json({ error: "Report not found" });
    report = {
      id: row.id,
      age: row.age,
      sex: row.sex,
      provider: row.provider,
      metadata: {},
      createdAt: row.created_at,
      biomarkers: row.biomarkers,
      rawFile: null,
    };
  } else {
    const memReport = reports.get(id);
    if (!memReport) return res.status(404).json({ error: "Report not found" });
    report = memReport;
  }

  let insights = null;

  try {
    insights = await generateInsightsWithLLM(report);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("LLM insights failed, falling back to mock", err);
  }

  // Fallback mock if LLM is not configured or fails.
  if (!insights) {
    insights = {
      summary:
        "Overall, your biomarkers are mostly within optimal ranges with a few areas for improvement.",
      keyFindings: [
        {
          biomarker: "Vitamin D",
          status: "low",
          message:
            "Your Vitamin D level is below the optimal range, which can affect bone health, mood, and immunity.",
        },
        {
          biomarker: "LDL Cholesterol",
          status: "borderline-high",
          message:
            "Your LDL cholesterol is slightly elevated; consider dietary adjustments and activity.",
        },
      ],
      biomarkerTrends: [
        {
          biomarker: "Vitamin D",
          unit: "ng/mL",
          points: [
            { date: "2024-01-01", value: 18 },
            { date: report.createdAt.slice(0, 10), value: 22 },
          ],
        },
        {
          biomarker: "LDL Cholesterol",
          unit: "mg/dL",
          points: [
            { date: "2024-01-01", value: 145 },
            { date: report.createdAt.slice(0, 10), value: 140 },
          ],
        },
      ],
      lifestyleRecommendations: [
        "Aim for 20–30 minutes of daylight exposure daily to naturally boost Vitamin D.",
        "Incorporate 150 minutes/week of moderate cardio such as brisk walking or cycling.",
        "Prioritize fiber-rich foods (oats, legumes, vegetables) to support cholesterol balance.",
      ],
    };
  }

  const relevantFindings = (insights.keyFindings || []).filter(
    (k) => k.status === "low" || k.status === "borderline-high"
  );

  let ideaSuggestions = [];
  try {
    const llmIdeas = await recommendProductsWithLLM(insights);
    if (Array.isArray(llmIdeas) && llmIdeas.length > 0) {
      ideaSuggestions = llmIdeas;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      "Product recommendation LLM failed; falling back to simple keywords",
      err
    );
  }

  if (!ideaSuggestions.length) {
    ideaSuggestions = relevantFindings.map((k) => ({
      biomarker: k.biomarker,
      category: "supplement",
      name: `${k.biomarker} supplement`,
      searchKeyword: `${k.biomarker} supplement`,
      rationale: "",
    }));
  }

  ideaSuggestions = ideaSuggestions.slice(0, 5);

  const personalizedProducts = [];
  const seenIds = new Set();

  try {
    for (let i = 0; i < ideaSuggestions.length; i++) {
      const s = ideaSuggestions[i];
      const keyword =
        s.searchKeyword || s.name || s.biomarker || s.relatedBiomarker;
      if (!keyword) continue;

      const amazonItems = await searchCanopyProductsByKeyword({
        keywords: keyword,
        itemCount: 1,
        biomarker: s.biomarker || s.relatedBiomarker || "",
        category: s.category,
      });

      const item = amazonItems[0];
      if (item && !seenIds.has(item.id)) {
        personalizedProducts.push(item);
        seenIds.add(item.id);
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Amazon product search failed; falling back to static", err);
  }

  if (personalizedProducts.length === 0) {
    personalizedProducts.push(
      ...products.filter((p) =>
        relevantFindings.some(
          (k) =>
            k.biomarker.toLowerCase() === p.biomarker.toLowerCase()
        )
      )
    );
  }

  res.json({
    reportId: report.id,
    insights,
    personalizedProducts,
  });
});

// Simple product catalog and personalization endpoint
app.get("/api/products", (_req, res) => {
  res.json({ products });
});

app.post("/api/personalize", (req, res) => {
  const { biomarkers } = req.body || {};
  if (!Array.isArray(biomarkers)) {
    return res.status(400).json({ error: "biomarkers must be an array" });
  }

  const personalized = products.filter((p) =>
    biomarkers.some(
      (b) =>
        b.name && b.status &&
        b.name.toLowerCase() === p.biomarker.toLowerCase() &&
        (b.status === "low" || b.status === "borderline-high")
    )
  );

  res.json({ products: personalized });
});

// Generate a Junction Link token for connecting cloud-based wearables (e.g., Whoop)
// For this demo we use a static Junction user id; in a real app use your own user id
const JUNCTION_DEMO_USER_ID =
  process.env.JUNCTION_DEMO_USER_ID || "demo-user-1";

app.post("/api/wearables/link-token", async (req, res) => {
  const junctionApiKey = process.env.JUNCTION_API_KEY;
  const junctionBaseUrl =
    process.env.JUNCTION_BASE_URL ||
    (junctionApiKey && junctionApiKey.startsWith("sk_us_")
      ? "https://api.sandbox.tryvital.io"
      : "https://api.tryvital.io");
  const base = junctionBaseUrl.replace(/\/$/, "");

  if (!junctionApiKey) {
    return res.status(500).json({
      error: "Junction API not configured",
      details: "Missing JUNCTION_API_KEY in environment",
    });
  }

  try {
    const body = {
      user_id: JUNCTION_DEMO_USER_ID,
      provider: "whoop_v2",
    };

    const response = await fetchWithTimeout(`${base}/v2/link/token`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-vital-api-key": junctionApiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      return res.status(502).json({
        error: "Failed to generate Junction Link token",
        status: response.status,
        body: data,
      });
    }

    return res.json({
      link_token: data.link_token,
      link_web_url: data.link_web_url,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error generating Junction Link token", err);
    return res.status(502).json({
      error: "Error generating Junction Link token",
      details: err.message || String(err),
    });
  }
});

// Wearable (Whoop) integration via Junction API
// Junction exposes sleep/activity summaries by user_id; WHOOP data appears there once connected.
// Docs: https://docs.junction.com/api-reference/data/sleep/get-summary.md, activity/get-summary.md
// Auth: X-Vital-API-Key. Base URL: api.sandbox.tryvital.io (sk_us_*) or api.tryvital.io (pk_us_*).
app.get("/api/wearables/whoop", async (req, res) => {
  const junctionApiKey = process.env.JUNCTION_API_KEY;
  const junctionBaseUrl =
    process.env.JUNCTION_BASE_URL ||
    (junctionApiKey && junctionApiKey.startsWith("sk_us_")
      ? "https://api.sandbox.tryvital.io"
      : "https://api.tryvital.io");
  const base = junctionBaseUrl.replace(/\/$/, "");
  const userId = JUNCTION_DEMO_USER_ID;

  if (!junctionApiKey) {
    return res.status(500).json({
      error: "Junction API not configured",
      details: "Missing JUNCTION_API_KEY in environment",
    });
  }

  const isYmd = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const queryStart = req.query.start_date;
  const queryEnd = req.query.end_date;

  const end = queryEnd && isYmd(queryEnd) ? new Date(`${queryEnd}T00:00:00Z`) : new Date();
  const start =
    queryStart && isYmd(queryStart)
      ? new Date(`${queryStart}T00:00:00Z`)
      : new Date(end);

  if (queryStart && !isYmd(queryStart)) {
    return res.status(400).json({ error: "Invalid start_date. Use YYYY-MM-DD." });
  }
  if (queryEnd && !isYmd(queryEnd)) {
    return res.status(400).json({ error: "Invalid end_date. Use YYYY-MM-DD." });
  }

  // If caller didn't specify start_date, default to last 30 days.
  if (!queryStart || !isYmd(queryStart)) {
    start.setDate(start.getDate() - 30);
  }

  const endDate = end.toISOString().slice(0, 10);
  const startDate = start.toISOString().slice(0, 10);

  const headers = {
    Accept: "application/json",
    "x-vital-api-key": junctionApiKey,
  };

  try {
    const [sleepRes, activityRes] = await Promise.all([
      fetchWithTimeout(
        `${base}/v2/summary/sleep/${encodeURIComponent(
          userId
        )}?start_date=${startDate}&end_date=${endDate}`,
        { method: "GET", headers }
      ),
      fetchWithTimeout(
        `${base}/v2/summary/activity/${encodeURIComponent(
          userId
        )}?start_date=${startDate}&end_date=${endDate}&provider=whoop_v2`,
        { method: "GET", headers }
      ),
    ]);

    const sleepBody = await sleepRes.json().catch(() => null);
    let activityBody = await activityRes.json().catch(() => null);

    // If the provider-filtered activity call returns empty, fall back to
    // any available activity sources so steps still show after connection.
    const activityIsEmpty =
      activityBody &&
      (Array.isArray(activityBody.activity) &&
        activityBody.activity.length === 0);

    if (activityRes.ok && activityIsEmpty) {
      const fallbackActivityRes = await fetchWithTimeout(
        `${base}/v2/summary/activity/${encodeURIComponent(
          userId
        )}?start_date=${startDate}&end_date=${endDate}`,
        { method: "GET", headers }
      );
      const fallbackActivityBody = await fallbackActivityRes
        .json()
        .catch(() => null);
      if (fallbackActivityRes.ok && fallbackActivityBody) {
        activityBody = fallbackActivityBody;
      }
    }

    if (!sleepRes.ok && !activityRes.ok) {
      const firstErr = !sleepRes.ok ? sleepBody : activityBody;
      return res.status(502).json({
        error: "Failed to fetch WHOOP data from Junction",
        details: {
          sleep: { status: sleepRes.status, body: sleepBody },
          activity: { status: activityRes.status, body: activityBody },
        },
        message:
          firstErr?.detail ||
          firstErr?.message ||
          "Ensure your Junction user is connected to WHOOP via Link and try again.",
      });
    }

    const raw = {
      sleep: sleepRes.ok ? sleepBody : { error: sleepRes.status, body: sleepBody },
      activity: activityRes.ok
        ? activityBody
        : { error: activityRes.status, body: activityBody },
    };

    return res.json({
      provider: "whoop",
      status: "ok",
      message: "WHOOP data loaded from Junction.",
      raw,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error calling Junction WHOOP endpoint", err);
    return res.status(502).json({
      error: "Error calling Junction WHOOP endpoint",
      details: err.message || String(err),
    });
  }
});

// List connected providers (so we can verify WHOOP is actually connected)
app.get("/api/wearables/junction/providers", async (_req, res) => {
  const junctionApiKey = process.env.JUNCTION_API_KEY;
  const junctionBaseUrl =
    process.env.JUNCTION_BASE_URL ||
    (junctionApiKey && junctionApiKey.startsWith("sk_us_")
      ? "https://api.sandbox.tryvital.io"
      : "https://api.tryvital.io");
  const base = junctionBaseUrl.replace(/\/$/, "");
  const userId = JUNCTION_DEMO_USER_ID;

  if (!junctionApiKey) {
    return res.status(500).json({
      error: "Junction API not configured",
      details: "Missing JUNCTION_API_KEY in environment",
    });
  }

  try {
    const response = await fetchWithTimeout(
      `${base}/v2/user/providers/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-vital-api-key": junctionApiKey,
        },
      }
    );

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      return res.status(502).json({
        error: "Failed to load Junction connected providers",
        status: response.status,
        body: data,
      });
    }

    return res.json({
      userId,
      providers: data.providers || [],
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error calling Junction providers endpoint", err);
    return res.status(502).json({
      error: "Error calling Junction providers endpoint",
      details: err.message || String(err),
    });
  }
});

// Trigger a manual refresh for the Junction user (kicks off ingestion)
app.post("/api/wearables/junction/refresh", async (_req, res) => {
  const junctionApiKey = process.env.JUNCTION_API_KEY;
  const junctionBaseUrl =
    process.env.JUNCTION_BASE_URL ||
    (junctionApiKey && junctionApiKey.startsWith("sk_us_")
      ? "https://api.sandbox.tryvital.io"
      : "https://api.tryvital.io");
  const base = junctionBaseUrl.replace(/\/$/, "");
  const userId = JUNCTION_DEMO_USER_ID;

  if (!junctionApiKey) {
    return res.status(500).json({
      error: "Junction API not configured",
      details: "Missing JUNCTION_API_KEY in environment",
    });
  }

  try {
    const response = await fetchWithTimeout(`${base}/v2/user/refresh/${userId}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-vital-api-key": junctionApiKey,
      },
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data) {
      return res.status(502).json({
        error: "Failed to refresh Junction user data",
        status: response.status,
        body: data,
      });
    }

    return res.json(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error calling Junction refresh endpoint", err);
    return res.status(502).json({
      error: "Error calling Junction refresh endpoint",
      details: err.message || String(err),
    });
  }
});

// Extract biomarkers from all PDFs in backend/reports/ and return for data page (LLM extraction)
app.post("/api/data/extract", async (_req, res) => {
  try {
    const { text, fileCount } = await extractBiomarkersFromReportsDir();
    // eslint-disable-next-line no-console
    console.log("[data/extract] PDFs read:", fileCount, "| extracted text length:", text ? text.length : 0);

    if (!text || fileCount === 0) {
      // eslint-disable-next-line no-console
      console.log("[data/extract] No PDF text — no biomarker data pulled. fileCount:", fileCount);
      return res.status(404).json({
        error: "No PDF reports found in reports directory",
        fileCount: 0,
        biomarkers: [],
      });
    }

    let biomarkers = null;
    // Cache biomarker extraction results so we don't re-call the LLM repeatedly
    // for the same extracted OCR text.
    // Version suffix so cache invalidates when we change extraction logic.
    const biomarkerCacheKey = crypto
      .createHash("md5")
      .update(text)
      .update("|v2_dedupe")
      .digest("hex");
    const biomarkerCachePath = path.join(
      BIOMARKER_CACHE_DIR,
      `${biomarkerCacheKey}.json`
    );
    if (fs.existsSync(biomarkerCachePath)) {
      // eslint-disable-next-line no-console
      console.log(
        "[data/extract] Using cached biomarker extraction results"
      );
      const cached = JSON.parse(fs.readFileSync(biomarkerCachePath, "utf8"));
      biomarkers = Array.isArray(cached?.biomarkers) ? cached.biomarkers : null;
    }

    if (!biomarkers && openai) {
      biomarkers = await extractBiomarkersWithLLMForDataPage(text);
      // eslint-disable-next-line no-console
      console.log("[data/extract] Primary LLM (full prompt) returned biomarkers:", biomarkers?.length ?? 0);

      // Fallback: simpler extraction (same PDF + LLM, different prompt) then normalize
      if ((!biomarkers || biomarkers.length === 0) && text) {
        // eslint-disable-next-line no-console
        console.log("[data/extract] Trying fallback LLM (simpler prompt)...");
        const simple = await extractBiomarkersWithLLM(text);
        // eslint-disable-next-line no-console
        console.log("[data/extract] Fallback LLM returned biomarkers:", simple?.length ?? 0);
        if (Array.isArray(simple) && simple.length > 0) {
          const normalized = simple.map((b) => {
            const ref = parseRefRange(b.referenceRange ?? b.reference_range);
            return normalizeBiomarker({
              ...b,
              category: categoryFromBiomarkerName(b.name),
              refMin: ref.refMin,
              refMax: ref.refMax,
            });
          });
          const seen = new Map(); // key -> biomarker
          for (const b of normalized) {
            const key = `${(b.name || "").toLowerCase().trim()}|${(b.unit || "").toLowerCase().trim()}`;
            seen.set(key, b);
          }
          biomarkers = Array.from(seen.values());
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[data/extract] OPENAI_API_KEY not set — no LLM extraction, no biomarker data pulled.");
    }

    if (!biomarkers || !Array.isArray(biomarkers) || biomarkers.length === 0) {
      // eslint-disable-next-line no-console
      console.log("[data/extract] No biomarker data pulled. Returning extracted: false, biomarkers: []");
      return res.json({
        reportMeta: { source: "reports", fileCount, extracted: false },
        biomarkers: [],
      });
    }

    if (!fs.existsSync(BIOMARKER_CACHE_DIR)) {
      fs.mkdirSync(BIOMARKER_CACHE_DIR, { recursive: true });
    }
    fs.writeFileSync(
      biomarkerCachePath,
      JSON.stringify({ biomarkers }, null, 2),
      "utf8"
    );

    // eslint-disable-next-line no-console
    console.log("[data/extract] Success. Returning", biomarkers.length, "biomarkers.");
    return res.json({
      reportMeta: { source: "reports", fileCount, extracted: true },
      biomarkers,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error extracting biomarkers from reports", err);
    return res.status(500).json({
      error: err.message || "Failed to extract biomarkers",
      biomarkers: [],
    });
  }
});

function getStatusExplanation(status) {
  const s = (status || "").toString().toLowerCase();
  if (s.includes("low")) return "low";
  if (s.includes("high")) return "high";
  if (s.includes("borderline")) return "borderline";
  if (s.includes("normal")) return "normal";
  return "normal";
}

function fallbackExplainBiomarker({ name, category, status, referenceRange }) {
  const statusKey = getStatusExplanation(status);
  const rangeText =
    referenceRange && typeof referenceRange === "string"
      ? `Reference range shown on your report: ${referenceRange}.`
      : "Reference range not provided in the OCR/LLM output.";

  const cat = (category || "summary").toLowerCase();
  const byCat = {
    heart: "cardiovascular and lipid metabolism",
    metabolic: "glucose/insulin handling and energy metabolism",
    sex: "sex-hormone balance and reproductive/endocrine function",
    thyroid: "thyroid hormone balance and metabolic rate",
    inflammation: "inflammation and immune activity",
    liver: "liver function and metabolic processing",
    kidney: "kidney filtration and waste handling",
    nutrients: "nutritional status and vitamin/mineral sufficiency",
    immune: "immune system activity and blood cell production",
    summary: "overall health risk signals",
    energy: "energy metabolism and related processes",
    dna: "oxidative stress and related DNA/repair signals",
    gut: "gastrointestinal health signals",
    toxin: "exposure and detoxification signals",
  };

  const whatItIs = `${name} is a lab marker clinicians use to assess ${byCat[cat] || byCat.summary}.`;

  const whatHighMeans =
    statusKey === "high"
      ? `Because your result is flagged high, it can suggest that ${name} is above typical levels for your lab’s reference interval. This may reflect physiology, recent diet/medications, inflammation, or other context.`
      : `When ${name} is high, clinicians often consider potential causes and context (timing, symptoms, medications, and other labs). ${rangeText}`;

  const whatLowMeans =
    statusKey === "low"
      ? `Because your result is flagged low, it can suggest ${name} is below typical levels. This may be due to intake, absorption, hormonal status, illness/recovery phase, or other factors.`
      : `When ${name} is low, clinicians typically review symptoms, medication history, and related labs. ${rangeText}`;

  const whatBorderlineMeans =
    statusKey === "borderline"
      ? `A borderline result means ${name} is close to the lab’s cutoffs. It often warrants correlation with symptoms and repeat testing if clinically appropriate. ${rangeText}`
      : `Borderline values usually mean “near the cutoff,” and clinicians interpret them using the full clinical picture. ${rangeText}`;

  const questionsForClinician = [
    `Based on ${name}, what is the most likely explanation for my high/low/borderline result?`,
    `Do my symptoms and other labs (especially related markers in ${cat || "my"} category) support that interpretation?`,
    `Should I repeat ${name}? If yes, when and under what conditions (fasting, medication timing, etc.)?`,
  ];

  return {
    name,
    whatItIs,
    whyItMatters: `Your result provides a signal about ${byCat[cat] || byCat.summary}. Interpreting it with other biomarkers helps estimate potential risk or nutritional/hormonal status.`,
    whatHighMeans,
    whatLowMeans,
    whatBorderlineMeans,
    normalMeans: `A normal range suggests ${name} falls within the lab’s typical interval. Clinicians still consider trends over time and how it fits with your other health data. ${rangeText}`,
    practicalNotes: [
      `Look at trends: a single measurement is less informative than repeated testing.`,
      `Interpret with context: symptoms, medications/supplements, and timing often matter.`,
      `Discuss with your clinician before making major changes.`,
    ],
    questionsForClinician,
    disclaimer:
      "Educational information only; not medical advice. Discuss results with a qualified healthcare professional.",
  };
}

async function explainBiomarkerWithLLM({ name, category, status, unit, referenceRange }) {
  if (!openai) return null;

  const systemPrompt =
    "You are a careful health educator and lab-interpretation assistant. " +
    "You must respond in strict JSON only. You are not a doctor. " +
    "Explain the biomarker in plain language, including what high/low/borderline can mean, and what typical next steps are to discuss with a clinician. " +
    "Do not provide diagnoses or prescribe treatments. Keep it factual and balanced.";

  const statusKey = getStatusExplanation(status);

  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content:
          JSON.stringify({
            name,
            category,
            status: statusKey,
            unit,
            referenceRange,
          }) +
          "\n\nReturn JSON with fields: " +
          "{ name, whatItIs, whyItMatters, whatHighMeans, whatLowMeans, whatBorderlineMeans, normalMeans, practicalNotes (string[]), questionsForClinician (string[]), disclaimer }. " +
          "Use the provided referenceRange in the normal/high/low explanations when available.",
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw);
  return parsed;
}

// Biomarker explanation for the UI modal
app.post("/api/biomarker/explain", async (req, res) => {
  try {
    const { name, status, unit, referenceRange, category } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required" });
    }

    if (!fs.existsSync(BIOMARKER_EXPLAIN_CACHE_DIR)) {
      fs.mkdirSync(BIOMARKER_EXPLAIN_CACHE_DIR, { recursive: true });
    }

    const cacheKey = crypto
      .createHash("md5")
      .update(
        JSON.stringify({
          name,
          status: status || "",
          unit: unit || "",
          referenceRange: referenceRange || "",
          category: category || "",
        })
      )
      .digest("hex");
    const cachePath = path.join(
      BIOMARKER_EXPLAIN_CACHE_DIR,
      `${cacheKey}.json`
    );

    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      return res.json({ explanation: cached });
    }

    // For speed: use the deterministic fallback explanations by default.
    // If you explicitly want LLM explanations, set BIOMARKER_EXPLAIN_USE_LLM=true.
    let explanation = fallbackExplainBiomarker({
      name,
      category,
      status,
      referenceRange,
    });

    const useLlm =
      process.env.BIOMARKER_EXPLAIN_USE_LLM &&
      process.env.BIOMARKER_EXPLAIN_USE_LLM.toString().toLowerCase() ===
        "true";

    if (useLlm) {
      try {
        const llmExplanation = await explainBiomarkerWithLLM({
          name,
          category,
          status,
          unit,
          referenceRange,
        });
        if (llmExplanation) explanation = llmExplanation;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("Failed to generate biomarker explanation via LLM", err);
      }
    }

    fs.writeFileSync(
      cachePath,
      JSON.stringify(explanation, null, 2),
      "utf8"
    );

    return res.json({ explanation });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error in /api/biomarker/explain", err);
    return res.status(500).json({ error: "Failed to explain biomarker" });
  }
});

// Personal insight for biomarker + WHOOP trend overlay
app.post("/api/biomarker/personal-insight", async (req, res) => {
  try {
    const { biomarker, whoopOverlay } = req.body || {};
    const b = biomarker || {};

    const name = b.name;
    const status = b.status;
    const unit = b.unit;
    const referenceRange = b.referenceRange;
    const category = b.category;
    const value = b.value;

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "biomarker.name is required" });
    }

    if (!fs.existsSync(BIOMARKER_PERSONAL_INSIGHT_CACHE_DIR)) {
      fs.mkdirSync(BIOMARKER_PERSONAL_INSIGHT_CACHE_DIR, { recursive: true });
    }

    const overlayPoints = Array.isArray(whoopOverlay?.points)
      ? whoopOverlay.points
      : [];
    const whoopMetricLabel = whoopOverlay?.whoopMetricLabel || "";

    // Keep cache key stable but small.
    const keySeed = {
      name,
      status: status || "",
      unit: unit || "",
      referenceRange: referenceRange || "",
      category: category || "",
      value: value ?? null,
      whoopMetricLabel,
      // Include Canopy enrichment version so old cached responses get refreshed
      // when product URLs are added.
      canopyLookupVersion: process.env.CANOPY_API_KEY ? "with_urls" : "no_urls",
      // first/last few points
      points: overlayPoints
        .filter((p) => p && typeof p.date === "string")
        .slice(0, 5)
        .concat(overlayPoints.filter((p) => p && typeof p.date === "string").slice(-5))
        .map((p) => ({
          date: p.date,
          biomarkerValue: p.biomarkerValue ?? null,
          whoopValue: p.whoopValue ?? null,
        })),
    };

    const cacheKey = crypto
      .createHash("md5")
      .update(JSON.stringify(keySeed))
      .digest("hex");
    const cachePath = path.join(
      BIOMARKER_PERSONAL_INSIGHT_CACHE_DIR,
      `${cacheKey}.json`
    );

    if (fs.existsSync(cachePath)) {
      const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
      return res.json({ personalInsight: cached });
    }

    const enrichProductRecommendationsWithCanopy = async (
      productRecommendations
    ) => {
      if (
        !Array.isArray(productRecommendations) ||
        productRecommendations.length === 0
      ) {
        return productRecommendations;
      }

      // Only look up a couple to keep latency/requests low.
      const maxToEnrich = Math.min(2, productRecommendations.length);
      const enriched = [...productRecommendations];

      for (let i = 0; i < maxToEnrich; i++) {
        const rec = enriched[i];
        const keyword = rec?.name || name;
        if (!keyword) continue;

        try {
          const items = await searchCanopyProductsByKeyword({
            keywords: keyword,
            itemCount: 1,
            biomarker: name,
            category: rec?.category || category,
          });
          const item = items?.[0];
          if (item?.url) {
            rec.url = item.url;
            rec.asin = item.asin || null;
            rec.retailer = rec?.retailer || item.retailer || "Amazon";
          }
        } catch {
          // Non-fatal: keep existing recommendation without link.
        }
      }

      return enriched;
    };

    const fallback = () => {
      // Lightweight deterministic fallback when OpenAI is not configured.
      const statusKey = getStatusExplanation(status || "");
      return {
        summary: `Trend education for ${name} (${statusKey}).`,
        trendExplanation:
          "Connect WHOOP and ensure data has synced to generate true trend overlap insights.",
        practicalAdvice: [
          "Use your clinician as the source of truth for interpretation.",
          "If you are trending high or low, consider focusing on sleep consistency, daily activity, and nutrition quality.",
        ],
        productRecommendations: [
          {
            name: `Supplement for ${name}`,
            category: "supplement",
            rationale:
              "Generic suggestion placeholder (replace with LLM output when configured).",
          },
        ],
        clinicianQuestions: [
          `What is the clinical significance of my ${name} being ${statusKey}?`,
          "Should we repeat this test and in what timeframe?",
        ],
        disclaimer:
          "This is educational information, not medical advice. Consult a qualified clinician for diagnosis and treatment.",
      };
    };

    if (!openai) {
      const personalInsight = fallback();
      personalInsight.productRecommendations =
        await enrichProductRecommendationsWithCanopy(
          personalInsight.productRecommendations
        );
      fs.writeFileSync(
        cachePath,
        JSON.stringify(personalInsight, null, 2),
        "utf8"
      );
      return res.json({ personalInsight });
    }

    const overlap = {
      whoopMetricLabel,
      points: overlayPoints.map((p) => ({
        date: p?.date,
        biomarkerValue: p?.biomarkerValue ?? null,
        whoopValue: p?.whoopValue ?? null,
      })),
    };

    const systemPrompt =
      "You are a careful health educator that explains lab biomarkers and wearable (WHOOP-like) trend overlap. " +
      "You must respond in strict JSON only. You are not a doctor. " +
      "Do not provide diagnoses or prescribe medications. " +
      "Keep advice general, safety-focused, and aligned with seeing your clinician. " +
      "Recommend only generic, non-brand-specific supplement/device/food ideas, and include a rationale. " +
      "Return a JSON object with exactly these top-level keys: " +
      "{ summary: string, trendExplanation: string, practicalAdvice: string[], " +
      "productRecommendations: { name: string, category: string, rationale: string }[], " +
      "clinicianQuestions: string[], disclaimer: string }.";

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: JSON.stringify({
            biomarker: {
              name,
              status: getStatusExplanation(status || ""),
              unit,
              value: value ?? null,
              referenceRange: referenceRange ?? null,
              category: category ?? null,
            },
            whoopOverlap: overlap,
          }),
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content || "{}";
    const personalInsight = JSON.parse(raw);

    personalInsight.productRecommendations =
      await enrichProductRecommendationsWithCanopy(
        personalInsight.productRecommendations
      );

    fs.writeFileSync(
      cachePath,
      JSON.stringify(personalInsight, null, 2),
      "utf8"
    );

    return res.json({ personalInsight });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error in /api/biomarker/personal-insight", err);
    return res.status(500).json({ error: "Failed to generate personal insight" });
  }
});

function stableIntHash(input) {
  // Deterministic small integer hash for generating mock variation.
  const buf = crypto.createHash("md5").update(String(input)).digest();
  return buf.readUInt32BE(0);
}

function computeStatusFromRange(value, refMin, refMax) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "normal";
  if (typeof refMin !== "number" || typeof refMax !== "number") return "normal";
  const min = Math.min(refMin, refMax);
  const max = Math.max(refMin, refMax);
  const span = max - min || 1;
  const near = span * 0.05; // within 5% of the boundary => borderline

  if (value < min) return value <= min - near ? "low" : "borderline";
  if (value > max) return value >= max + near ? "high" : "borderline";
  return "normal";
}

function pickTrendMarkers(biomarkers, maxMarkers) {
  const withStatus = biomarkers.filter(
    (b) => (b.status || "").toString().toLowerCase() !== "normal"
  );
  const base = withStatus.length ? withStatus : biomarkers;
  const catWeight = (c) => {
    const k = (c || "").toString().toLowerCase();
    if (k === "sex") return 0;
    if (k === "thyroid") return 1;
    if (k === "heart") return 2;
    if (k === "metabolic") return 3;
    if (k === "inflammation") return 4;
    if (k === "kidney") return 5;
    if (k === "liver") return 6;
    return 7;
  };
  const sorted = [...base].sort((a, b) => {
    const wa = catWeight(a.category);
    const wb = catWeight(b.category);
    if (wa !== wb) return wa - wb;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const unique = [];
  const seen = new Set();
  for (const b of sorted) {
    const key = `${String(b.name || "").toLowerCase().trim()}|${String(
      b.unit || ""
    ).toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(b);
    if (unique.length >= maxMarkers) break;
  }
  return unique;
}

async function getBaseBiomarkersForMock() {
  const { text, fileCount } = await extractBiomarkersFromReportsDir();
  if (!text || fileCount === 0) return [];

  // Use the same biomarker cache key as /api/data/extract so we avoid LLM calls.
  const biomarkerCacheKey = crypto
    .createHash("md5")
    .update(text)
    .update("|v2_dedupe")
    .digest("hex");
  const biomarkerCachePath = path.join(
    BIOMARKER_CACHE_DIR,
    `${biomarkerCacheKey}.json`
  );

  if (fs.existsSync(biomarkerCachePath)) {
    const cached = JSON.parse(fs.readFileSync(biomarkerCachePath, "utf8"));
    return Array.isArray(cached?.biomarkers) ? cached.biomarkers : [];
  }

  // If cache isn't available, fall back to LLM extraction (slower).
  const extracted = await extractBiomarkersWithLLMForDataPage(text);
  if (!Array.isArray(extracted)) return [];
  return extracted;
}

app.post("/api/reports/mock/seed", async (_req, res) => {
  try {
    const MOCK_REPORT_COUNT = Number(process.env.MOCK_REPORT_COUNT || 4);
    const MOCK_STEP_DAYS = Number(process.env.MOCK_STEP_DAYS || 30);
    const trendMaxMarkers = Number(
      process.env.MOCK_TREND_MAX_MARKERS || 20
    );

    if (latestMockReportId && mockReports.size >= MOCK_REPORT_COUNT) {
      return res.json({
        reportCount: mockReports.size,
        reportIds: Array.from(mockReports.keys()),
        latestMockReportId,
        seeded: false,
      });
    }

    const baseBiomarkers = await getBaseBiomarkersForMock();
    if (!baseBiomarkers.length) {
      return res.status(404).json({
        error: "No base biomarkers available for mocking",
      });
    }

    const selected = pickTrendMarkers(baseBiomarkers, trendMaxMarkers);
    const now = new Date();

    for (let i = 0; i < MOCK_REPORT_COUNT; i++) {
      const reportDate = new Date(now);
      reportDate.setDate(
        now.getDate() - (MOCK_REPORT_COUNT - 1 - i) * MOCK_STEP_DAYS
      );

      const biomarkers = selected.map((b) => {
        const seed = stableIntHash(`${b.name}|${b.unit}|${i}`);
        const sign = seed % 2 === 0 ? -1 : 1;
        const magnitude = (seed % 1000) / 1000; // 0..1
        const deltaBase =
          (i - (MOCK_REPORT_COUNT - 1) / 2) / MOCK_REPORT_COUNT; // -..+
        const delta =
          deltaBase * (0.06 + magnitude * 0.05) * sign;

        let newValue = b.value * (1 + delta);
        if (!Number.isFinite(newValue) || Number.isNaN(newValue))
          newValue = b.value;
        if (newValue < 0) newValue = 0;

        const status = computeStatusFromRange(
          newValue,
          b.refMin ?? null,
          b.refMax ?? null
        );

        return {
          ...b,
          value: Number(newValue.toFixed(2)),
          status,
        };
      });

      const id = `mock_${now.getTime()}_${i}`;
      mockReports.set(id, {
        id,
        provider: "Mock PDFs",
        createdAt: reportDate.toISOString(),
        biomarkers,
      });
      if (i === MOCK_REPORT_COUNT - 1) latestMockReportId = id;
    }

    return res.json({
      reportCount: mockReports.size,
      reportIds: Array.from(mockReports.keys()),
      latestMockReportId,
      seeded: true,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error seeding mock reports", err);
    return res.status(500).json({ error: "Failed to seed mock reports" });
  }
});

app.post("/api/reports/mock/trends", async (_req, res) => {
  try {
    const MOCK_REPORT_COUNT = Number(process.env.MOCK_REPORT_COUNT || 4);
    const MOCK_STEP_DAYS = Number(process.env.MOCK_STEP_DAYS || 30);
    const trendMaxMarkers = Number(
      process.env.MOCK_TREND_MAX_MARKERS || 20
    );

    // Seed on-demand if we don't have enough mock reports yet.
    if (!latestMockReportId || mockReports.size < MOCK_REPORT_COUNT) {
      mockReports.clear();
      latestMockReportId = null;

      const baseBiomarkers = await getBaseBiomarkersForMock();
      if (!baseBiomarkers.length) {
        return res.status(404).json({
          error: "No base biomarkers available for mocking",
        });
      }

      const selected = pickTrendMarkers(baseBiomarkers, trendMaxMarkers);
      const now = new Date();

      for (let i = 0; i < MOCK_REPORT_COUNT; i++) {
        const reportDate = new Date(now);
        reportDate.setDate(
          now.getDate() - (MOCK_REPORT_COUNT - 1 - i) * MOCK_STEP_DAYS
        );

        const biomarkers = selected.map((b) => {
          const seed = stableIntHash(`${b.name}|${b.unit}|${i}`);
          const sign = seed % 2 === 0 ? -1 : 1;
          const magnitude = (seed % 1000) / 1000; // 0..1
          const deltaBase =
            (i - (MOCK_REPORT_COUNT - 1) / 2) / MOCK_REPORT_COUNT; // -..+
          const delta =
            deltaBase * (0.06 + magnitude * 0.05) * sign;

          let newValue = b.value * (1 + delta);
          if (!Number.isFinite(newValue) || Number.isNaN(newValue))
            newValue = b.value;
          if (newValue < 0) newValue = 0;

          const status = computeStatusFromRange(
            newValue,
            b.refMin ?? null,
            b.refMax ?? null
          );

          return {
            ...b,
            value: Number(newValue.toFixed(2)),
            status,
          };
        });

        const id = `mock_${now.getTime()}_${i}`;
        mockReports.set(id, {
          id,
          provider: "Mock PDFs",
          createdAt: reportDate.toISOString(),
          biomarkers,
        });
        if (i === MOCK_REPORT_COUNT - 1) latestMockReportId = id;
      }
    }

    const reports = Array.from(mockReports.values()).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    if (!reports.length) {
      return res.status(404).json({ error: "No mock reports available" });
    }

    const byKey = new Map();
    for (const r of reports) {
      for (const b of r.biomarkers) {
        const key = `${String(b.name || "").toLowerCase().trim()}|${String(
          b.unit || ""
        ).toLowerCase().trim()}`;
        if (!byKey.has(key)) {
          byKey.set(key, {
            biomarker: b.name,
            unit: b.unit,
            points: [],
          });
        }
        byKey.get(key).points.push({
          date: new Date(r.createdAt).toISOString().slice(0, 10),
          value: Number(b.value),
        });
      }
    }

    const biomarkerTrends = Array.from(byKey.values());
    return res.json({
      reportId: latestMockReportId || "mock",
      insights: { biomarkerTrends },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Error generating mock trends", err);
    return res.status(500).json({ error: "Failed to generate mock trends" });
  }
});

// Analyze a fixed report from the repo (backend/reports/report1.pdf), mocked so it always works
app.post("/api/reports/static/report1/analyze", async (_req, res) => {
  const reportPath = path.join(__dirname, "reports", "report1.pdf");
  const exists = fs.existsSync(reportPath);

  const report = {
    id: "static-report1",
    age: 38,
    sex: "female",
    provider: "Static PDF",
    metadata: { fileExists: exists },
    createdAt: new Date().toISOString(),
    biomarkers: [
      { name: "Vitamin D", value: 18, unit: "ng/mL", status: "low" },
      { name: "LDL Cholesterol", value: 142, unit: "mg/dL", status: "borderline-high" },
      { name: "hs-CRP", value: 3.2, unit: "mg/L", status: "high" },
    ],
  };

  const insights = {
    summary:
      "Your report shows excellent health in several systems with a few targeted areas for improvement, especially vitamin D, LDL cholesterol, and inflammation markers.",
    keyFindings: [
      {
        biomarker: "Vitamin D",
        status: "low",
        message:
          "Vitamin D is below the optimal range, which can impact mood, bone density, and immune resilience. Consider supplementation and safe sun exposure.",
      },
      {
        biomarker: "LDL Cholesterol",
        status: "borderline-high",
        message:
          "LDL cholesterol is modestly elevated. Diet quality, fiber intake, and regular aerobic exercise can help move this toward optimal.",
      },
      {
        biomarker: "hs-CRP",
        status: "high",
        message:
          "Inflammation marker hs-CRP is above ideal. Focus on sleep, stress reduction, and an anti-inflammatory diet rich in colorful plants.",
      },
    ],
    biomarkerTrends: [
      {
        biomarker: "Vitamin D",
        unit: "ng/mL",
        points: [
          {
            date: new Date(
              Date.now() - 21 * 24 * 60 * 60 * 1000
            ).toISOString().slice(0, 10),
            value: 22,
          },
          {
            date: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000
            ).toISOString().slice(0, 10),
            value: 19,
          },
          { date: new Date().toISOString().slice(0, 10), value: 18 },
        ],
      },
      {
        biomarker: "LDL Cholesterol",
        unit: "mg/dL",
        points: [
          {
            date: new Date(
              Date.now() - 21 * 24 * 60 * 60 * 1000
            ).toISOString().slice(0, 10),
            value: 148,
          },
          {
            date: new Date(
              Date.now() - 7 * 24 * 60 * 60 * 1000
            ).toISOString().slice(0, 10),
            value: 145,
          },
          { date: new Date().toISOString().slice(0, 10), value: 142 },
        ],
      },
    ],
    lifestyleRecommendations: [
      "Aim for 20–30 minutes of daylight exposure most days, and discuss vitamin D3 supplementation (e.g., 2000–4000 IU) with your clinician.",
      "Accumulate at least 150 minutes per week of moderate cardio (brisk walking, cycling) plus 2x/week resistance training.",
      "Shift toward a Mediterranean-style diet: high in vegetables, olive oil, nuts, legumes, and fatty fish; low in ultra-processed foods.",
      "Prioritize 7–9 hours of high-quality sleep and 5–10 minutes of daily stress-reduction practice (breathwork, mindfulness, or similar).",
    ],
  };

  const relevantFindings = (insights.keyFindings || []).filter(
    (k) => k.status === "low" || k.status === "borderline-high"
  );

  let personalizedProducts = [];
  const ideaSuggestions = relevantFindings.slice(0, 5).map((k) => ({
    biomarker: k.biomarker,
    category: "supplement",
    name: `${k.biomarker} supplement`,
    searchKeyword: `${k.biomarker} supplement`,
    rationale: "",
  }));

  try {
    const seenIds = new Set();
    for (let i = 0; i < ideaSuggestions.length; i++) {
      const s = ideaSuggestions[i];
      const amazonItems = await searchCanopyProductsByKeyword({
        keywords: s.searchKeyword,
        itemCount: 1,
        biomarker: s.biomarker,
        category: s.category,
      });
      const item = amazonItems[0];
      if (item && !seenIds.has(item.id)) {
        personalizedProducts.push(item);
        seenIds.add(item.id);
      }
    }
  } catch {
    // If Canopy isn't configured, searchCanopyProductsByKeyword returns [] and we fall back below.
  }

  if (personalizedProducts.length === 0) {
    personalizedProducts = products.filter((p) =>
      relevantFindings.some(
        (k) => k.biomarker.toLowerCase() === p.biomarker.toLowerCase()
      )
    );
  }

  return res.json({
    report,
    reportId: report.id,
    insights,
    personalizedProducts,
  });
});

app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on port ${port}`);
});

