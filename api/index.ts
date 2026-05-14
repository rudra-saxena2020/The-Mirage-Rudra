import express from "express";
import cors from "cors";
import * as cheerio from "cheerio";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/api/healthz", (_req: any, res: any) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/scrape", async (req: any, res: any) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: "URL is required" });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Upgrade-Insecure-Requests": "1",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, .ads, #ads").remove();

    const raw_title = (
      $("h1").first().text().trim() ||
      $('meta[property="og:title"]').attr("content") ||
      $("title").text().trim()
    ).replace(/\s+/g, " ");

    let raw_description: string =
      $(
        ".product-description, #description, [itemprop='description'], .pdp-description"
      )
        .text()
        .trim() ||
      $('meta[property="og:description"]').attr("content") ||
      $('meta[name="description"]').attr("content") ||
      "";

    if (!raw_description) {
      raw_description = $("p")
        .map((_: any, el: any) => $(el).text().trim())
        .get()
        .filter((text: string) => text.length > 50)
        .slice(0, 3)
        .join(" ");
    }
    raw_description = raw_description?.replace(/\s+/g, " ").trim() || "";

    const raw_specs: string[] = [];
    $(
      "ul li, .product-specs li, .specifications li, .details-list li, [class*='details'] li, table tr"
    ).each((_: any, el: any) => {
      const text = $(el).text().trim().replace(/\s+/g, " ");
      if (
        text &&
        text.length > 2 &&
        text.length < 500 &&
        !text.includes("{") &&
        !text.includes("}")
      ) {
        raw_specs.push(text);
      }
    });

    const product_images: string[] = [];
    const baseUrl = new URL(url).origin;

    $("*").each((_: any, el: any) => {
      const attributes = [
        "src",
        "srcset",
        "data-src",
        "data-srcset",
        "data-origin",
        "data-original",
        "data-full-size",
        "data-zoom",
        "data-image",
        "data-large-image",
        "data-high-res",
        "data-zoom-image",
        "data-lazy",
        "href",
        "content",
        "data-origin-src",
      ];
      attributes.forEach((attr: string) => {
        const val = $(el).attr(attr);
        if (val) {
          const parts = val.split(",").map((p: string) => p.trim());
          parts.forEach((part: string) => {
            const firstUrl = part.split(" ")[0];
            if (
              firstUrl &&
              (firstUrl.match(/\.(jpg|jpeg|png|webp|avif)/i) ||
                firstUrl.includes("image"))
            ) {
              let absoluteSrc = firstUrl;
              if (firstUrl.startsWith("//"))
                absoluteSrc = `https:${firstUrl}`;
              else if (firstUrl.startsWith("/"))
                absoluteSrc = `${baseUrl}${firstUrl}`;
              else if (!firstUrl.startsWith("http")) {
                try {
                  absoluteSrc = new URL(firstUrl, url).href;
                } catch (e) {}
              }
              if (absoluteSrc.startsWith("http")) {
                const lowerSrc = absoluteSrc.toLowerCase();
                const isLikelyProductImage =
                  !lowerSrc.includes("icon") &&
                  !lowerSrc.includes("logo") &&
                  !lowerSrc.includes("pixel") &&
                  !lowerSrc.includes("spacer") &&
                  !lowerSrc.includes("banner") &&
                  !lowerSrc.includes("loading") &&
                  !lowerSrc.includes("avatar") &&
                  !lowerSrc.includes("badge") &&
                  !lowerSrc.includes("button");
                if (
                  isLikelyProductImage &&
                  !product_images.includes(absoluteSrc)
                ) {
                  product_images.push(absoluteSrc);
                }
              }
            }
          });
        }
      });
    });

    $("[style*='background']").each((_: any, el: any) => {
      const style = $(el).attr("style");
      const matches = style?.match(
        /url\(["']?(https?:\/\/[^"']+)["']?\)/gi
      );
      if (matches) {
        matches.forEach((m: string) => {
          const src = m.match(
            /url\(["']?(https?:\/\/[^"']+)["']?\)/i
          )?.[1];
          if (src && !product_images.includes(src))
            product_images.push(src);
        });
      }
    });

    const scriptImageMatches: string[] = [];
    $("script").each((_: any, el: any) => {
      const content = $(el).html();
      if (content && content.includes("http")) {
        const imgMatches = content.match(
          /https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?/gi
        );
        if (imgMatches) {
          imgMatches.forEach((match: string) => {
            if (
              !product_images.includes(match) &&
              !match.toLowerCase().includes("logo") &&
              !match.toLowerCase().includes("icon")
            ) {
              scriptImageMatches.push(match);
            }
          });
        }
      }
    });
    product_images.push(...scriptImageMatches);

    const raw_price = (
      $(
        "[class*='price'], [id*='price'], .current-price, .product-price, .amount"
      )
        .first()
        .text()
        .trim() ||
      $('meta[property="product:price:amount"]').attr("content") ||
      $('meta[name="twitter:data1"]').attr("content") ||
      ""
    ).replace(/[^\d.,]/g, "");

    res.json({
      raw_title,
      raw_description,
      raw_specs: [...new Set(raw_specs)].slice(0, 30),
      product_images: [...new Set(product_images)].slice(0, 100),
      raw_price,
    });
  } catch (error: any) {
    console.error("Scraping error:", error);
    res.status(500).json({
      error: error.message || "Failed to scrape the URL.",
      details:
        "The site may be blocking server-side requests or require JavaScript rendering.",
    });
  }
});

app.post("/api/transform", async (req: any, res: any) => {
  const { data, tags } = req.body;
  if (!data) {
    res.status(400).json({ error: "data is required" });
    return;
  }

  const keysToTry = [
    process.env.GOOGLE_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.VITE_GEMINI_API_KEY_main,
    process.env.VITE_GEMINI_API_KEY_main2,
    process.env.VITE_GEMINI_API_KEYS_1,
    process.env.VITE_GEMINI_API_KEYS_2,
  ].filter((k): k is string => !!k && k.trim().length > 0);

  if (keysToTry.length === 0) {
    res.status(500).json({ error: "No Gemini API key configured. Add VITE_GEMINI_API_KEY to your Vercel environment variables." });
    return;
  }

  const tagList: string = Array.isArray(tags) ? tags.join(", ") : "";

  const prompt = `
You are a Shopify product content generator for the brand "The Mirage".
Your task is to generate product content STRICTLY in Mirage style.

INPUT DATA:
Title: ${data.raw_title}
Description: ${data.raw_description}
Specs: ${(data.raw_specs || []).join(", ")}
Cost Price: ${data.raw_price}

---
## PRICING ENGINE RULES (STRICT)
Your job is to convert cost_price into selling_price using these strict business rules:

1. IF cost_price > 100000 → selling_price = cost_price × 1.22
2. IF cost_price ≤ 100000 → selling_price = cost_price × 1.25
3. Round selling_price to nearest whole number (no decimals).
4. compare_at_price MUST be 30%–50% higher than selling_price (realistic rounded value).
5. If cost_price is missing or invalid, use 2999 as default selling_price.
6. All prices are in INR.

---
## CRITICAL BRAND RULE
* DO NOT mention "The Mirage" or "Mirage" anywhere in the main description text or the first sentence.
* The ONLY place Mirage should be mentioned is in the exact footer line provided below.

---
## DESCRIPTION TEMPLATE (STRICT)
You MUST follow this exact structure for the description (HTML format):

<p>Make refined strides with this [product_type], designed with a [key_design] and a clean, structured silhouette. This pair delivers a balanced combination of functionality and minimal design.</p>
<p>Crafted with a [material] upper and supported by a [heel_type], this product ensures durability while maintaining a refined and versatile aesthetic.</p>
<h3>Details</h3>
<ul>
  <li><strong>Upper:</strong> [material]</li>
  <li><strong>Lining:</strong> [material or "leather"]</li>
  <li><strong>Sole:</strong> durable outsole</li>
  <li><strong>Toe shape:</strong> [toe_shape]</li>
  <li><strong>Heel type:</strong> [heel_type]</li>
  <li><strong>Color:</strong> [color]</li>
  <li><strong>Detail:</strong> [key_design]</li>
  <li><strong>Closure:</strong> [slip-on OR buckle-fastening]</li>
</ul>
<p><em>Now available exclusively at Mirage Retail Collective — a rare addition reserved only for those who seek distinction and refined luxury ✨</em></p>

---
## HARD RULES
* DO NOT add storytelling or marketing lines
* Title Format: <Design> <Type> – <Color>
* Tags: Select 2-4 from this exact list: ${tagList}.
* Variants: Use "Title" as Option1 Name and "Default Title" as Option1 Value.

---
## VALIDATION STEP (MANDATORY)
Before output:
* Check if the exact line "Now available exclusively at Mirage Retail Collective..." is present at the very end of the description.
* Ensure "The Mirage" is NOT in the first sentence.

Respond with ONLY a JSON object with these fields:
{
  "title": string,
  "description": string (HTML),
  "tags": string[],
  "option1Name": string,
  "option1Value": string,
  "variantPrice": string,
  "compareAtPrice": string
}`;

  const modelsToTry = ["gemini-2.5-flash-preview-05-20", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-flash"];
  let lastError: string = "Unknown error";

  for (const key of keysToTry) {
    for (const model of modelsToTry) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          console.log(`[transform] trying ${model} attempt ${attempt}`);
          const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" },
              }),
            }
          );

          if (!geminiRes.ok) {
            const errBody: any = await geminiRes.json().catch(() => ({}));
            const msg: string = errBody?.error?.message || JSON.stringify(errBody);
            if (geminiRes.status === 429 || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
              throw new Error("QUOTA_EXCEEDED");
            }
            throw new Error(msg);
          }

          const geminiData: any = await geminiRes.json();
          let text: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (!text) throw new Error("Empty response from model");

          text = text.trim().replace(/^```json\n?/, "").replace(/^```\n?/, "").replace(/\n?```$/, "");
          const parsed = JSON.parse(text);
          console.log(`[transform] success with ${model}`);
          res.json(parsed);
          return;
        } catch (e: any) {
          lastError = e?.message || String(e);
          console.warn(`[transform] ${model} attempt ${attempt} failed:`, lastError);
          if (lastError.includes("503") && attempt === 1) {
            await new Promise((r) => setTimeout(r, 2000));
          } else {
            break;
          }
        }
      }
    }
  }

  const isQuota = lastError === "QUOTA_EXCEEDED";
  res.status(isQuota ? 429 : 500).json({
    error: isQuota
      ? "All Gemini API keys have exceeded their free-tier daily quota. Please wait until midnight (Pacific time) for the quota to reset, or add a new API key from ai.google.dev to your Vercel environment variables as VITE_GEMINI_API_KEY."
      : `AI transformation failed. Last error: ${lastError}`,
  });
});

app.get("/api/proxy-image", async (req: any, res: any) => {
  const { url, filename } = req.query;
  if (!url || typeof url !== "string") {
    res.status(400).send("URL is required");
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
    });

    if (!response.ok)
      throw new Error(`Failed to fetch image: ${response.statusText}`);

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      res.status(400).send("Target URL is not an image");
      return;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let extension = "jpg";
    if (contentType.includes("png")) extension = "png";
    else if (contentType.includes("webp")) extension = "webp";
    else if (contentType.includes("gif")) extension = "gif";
    else if (contentType.includes("avif")) extension = "avif";
    else if (contentType.includes("svg")) extension = "svg";

    const baseFilename = filename
      ? filename.toString().split(".")[0]
      : "product-image";
    const finalFilename = `${baseFilename}.${extension}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${finalFilename}"`
    );
    res.send(buffer);
  } catch (error: any) {
    console.error("Proxy error:", error);
    res.status(500).send("Failed to proxy image");
  }
});

export default app;
