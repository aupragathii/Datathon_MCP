// server.js
import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs";
import { prepareContextualPrompt } from "./context_manager.js"; // ES module import

dotenv.config();

const app = express();
app.use(bodyParser.json());
const port = 3000;

// --------------------------------------------------
// 1️⃣  Initialize OpenAI client
// --------------------------------------------------
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --------------------------------------------------
// 2️⃣  Load connector rules from JSON
// --------------------------------------------------
let connectorRules = {};
try {
  connectorRules = JSON.parse(fs.readFileSync("./intentRules.json", "utf8"));
  console.log("✅ Connector rules loaded successfully");
} catch (err) {
  console.warn("⚠️ No intentRules.json found, using defaults");
  connectorRules = {
    google_calendar: ["meeting", "schedule", "calendar", "free", "busy"],
    aws_monitor: ["server", "status", "deployment", "aws", "error", "uptime"],
    notion_docs: ["note", "decision", "project", "document", "summary"],
    github_repo: ["pull request", "repo", "commit", "issue"],
    stripe_finance: ["payment", "invoice", "balance", "transaction"],
    fitbit_health: ["steps", "sleep", "fitness", "health"],
  };
}

// --------------------------------------------------
// 3️⃣  Rule-based analyzer
// --------------------------------------------------
function ruleBasedAnalyzer(query) {
  const text = query.toLowerCase();

  const connectors = Object.keys(connectorRules).filter((conn) =>
    connectorRules[conn].some((keyword) => text.includes(keyword))
  );

  // Extract time hints
  let timeHint = null;
  if (text.includes("today")) timeHint = "today";
  else if (text.includes("tomorrow")) timeHint = "tomorrow";
  else if (/next\s+week/.test(text)) timeHint = "next_week";

  return {
    connectors: connectors.length ? connectors : ["semantic_search"],
    timeHint,
  };
}

// --------------------------------------------------
// 4️⃣  LLM-based analyzer
// --------------------------------------------------
async function llmAnalyzer(query) {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a classifier that maps user queries to connectors. Possible connectors: google_calendar, aws_monitor, notion_docs, github_repo, stripe_finance, fitbit_health. Respond ONLY with a JSON array of connector names.",
        },
        { role: "user", content: query },
      ],
    });

    const text = response.choices[0].message.content.trim();
    const parsed = JSON.parse(text);
    return parsed;
  } catch (error) {
    console.error("LLM analyzer error:", error.message);
    return [];
  }
}

// --------------------------------------------------
// 5️⃣  Hybrid analyzer (combine rule-based + LLM)
// --------------------------------------------------
async function analyzeIntent(query) {
  const ruleResult = ruleBasedAnalyzer(query);
  const llmConnectors = await llmAnalyzer(query);

  const combinedConnectors = [...new Set([...ruleResult.connectors, ...llmConnectors])];
  return { connectors: combinedConnectors, timeHint: ruleResult.timeHint };
}

// --------------------------------------------------
// 6️⃣  Mock connector fetchers (replace with real APIs later)
// --------------------------------------------------
async function fetchConnector(connector, user_id, query, timeHint) {
  const data = {
    google_calendar: `Checked calendar for ${timeHint || "upcoming"} meetings.`,
    aws_monitor: "Fetched server health metrics from AWS.",
    notion_docs: "Retrieved recent meeting notes and project updates.",
    github_repo: "Fetched latest pull requests and commits.",
    stripe_finance: "Fetched balance and transaction summaries.",
    fitbit_health: "Fetched recent step count and sleep stats.",
    semantic_search: "Performed general semantic search for context.",
  };

  return {
    connector,
    summary: data[connector] || "No data available",
  };
}

// --------------------------------------------------
// 7️⃣  Mock LLM Caller (Conceptual)
// --------------------------------------------------
async function callLLMApi({ finalPrompt, tools, user_id }) {
  console.log("--- Calling Final LLM API ---");
  console.log("Augmented Prompt Length:", finalPrompt.length);

  // Simulated LLM response
  return {
    llm_response_text: `[LLM Response] Answer for user ${user_id} based on the augmented prompt. Tools enabled: ${
      tools ? "google_search" : "None"
    }.`,
  };
}

// --------------------------------------------------
// 8️⃣  Main MCP route (final)
// --------------------------------------------------
app.post("/mcp-query", async (req, res) => {
  try {
    const { user_id, query } = req.body;
    if (!query) return res.status(400).json({ error: "Missing query text" });

    console.log(`🧠 Analyzing query: "${query}"`);

    // Part A: Intent analysis
    const intent = await analyzeIntent(query);
    console.log("🔍 Connectors selected:", intent.connectors);

    // Part B: Fetch connector context
    const results = await Promise.all(
      intent.connectors.map((conn) => fetchConnector(conn, user_id, query, intent.timeHint))
    );

    // Part C: Context Manager augmentation
    const { finalPrompt, tools } = await prepareContextualPrompt(query);
    console.log("📝 Context Manager prepared prompt and tools.");

    // Part D: Final LLM call
    const llmResult = await callLLMApi({
      finalPrompt,
      tools,
      user_id,
    });

    // Response payload
    res.json({
      final_llm_prompt: finalPrompt,
      final_response: llmResult.llm_response_text,
      mcp_metadata: {
        user_id,
        connectors_analyzed: intent.connectors,
        tools_enabled_by_context_manager: tools ? "google_search" : "None",
        mcp_sources: results,
      },
    });
  } catch (err) {
    console.error("❌ Error processing request:", err);
    res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------
// 9️⃣  Health check route
// --------------------------------------------------
app.get("/", (req, res) => {
  res.send("✅ MCP Hybrid Analyzer Server is running");
});

// --------------------------------------------------
// 🔟  Start server
// --------------------------------------------------
app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
