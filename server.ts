import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for scraping
  app.post("/api/scrape", async (req, res) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: "URL is required" });
    }

    let browser;
    try {
      // Step 1: Launch Puppeteer for dynamic rendering
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox", 
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu"
        ],
      });

      const page = await browser.newPage();
      
      // Set a realistic user agent
      await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
      
      // Set viewport to trigger desktop layouts
      await page.setViewport({ width: 1440, height: 900 });

      // Navigate to the URL with a shorter timeout
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

      // Scroll to the bottom to trigger lazy loading (faster)
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          let distance = 300; // Larger scroll distance for speed
          let timer = setInterval(() => {
            let scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            
            // If we've reached the bottom or a reasonable limit (shorter limit)
            if (totalHeight >= scrollHeight || totalHeight > 5000) {
              clearInterval(timer);
              resolve(null);
            }
          }, 50); // Faster interval
        });
      });

      // Shorter wait for any final images to load after scrolling
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Get the rendered HTML
      const html = await page.content();
      const $ = cheerio.load(html);

      // Step 3 & 4: Extract and Clean Data
      $("script, style, noscript, iframe, ad, .ads, #ads").remove();

      // Extract Title
      const raw_title = (
        $("h1").first().text().trim() || 
        $('meta[property="og:title"]').attr("content") || 
        $("title").text().trim()
      ).replace(/\s+/g, " ");
      
      // Extract Description
      let raw_description = (
        $(".product-description, #description, [itemprop='description'], .pdp-description").text().trim() ||
        $('meta[property="og:description"]').attr("content") ||
        $('meta[name="description"]').attr("content")
      );

      if (!raw_description) {
        raw_description = $("p").map((_, el) => $(el).text().trim()).get()
          .filter(text => text.length > 50)
          .slice(0, 3)
          .join(" ");
      }
      raw_description = raw_description?.replace(/\s+/g, " ").trim() || "";

      // Extract Specs
      const raw_specs: string[] = [];
      $("ul li, .product-specs li, .specifications li, .details-list li, [class*='details'] li, table tr").each((_, el) => {
        let text = $(el).text().trim().replace(/\s+/g, " ");
        if (text && text.length > 2 && text.length < 500 && !text.includes("{") && !text.includes("}")) {
          raw_specs.push(text);
        }
      });

      // Extract images
      const product_images: string[] = [];
      const baseUrl = new URL(url).origin;

      // 1. Extract from all possible image-related attributes
      $("*").each((_, el) => {
        const attributes = [
          "src", "srcset", "data-src", "data-srcset", "data-origin", "data-original", 
          "data-full-size", "data-zoom", "data-image", "data-large-image", "data-high-res",
          "data-zoom-image", "data-lazy", "href", "content", "data-origin-src"
        ];
        
        attributes.forEach(attr => {
          const val = $(el).attr(attr);
          if (val) {
            const parts = val.split(',').map(p => p.trim());
            parts.forEach(part => {
              const firstUrl = part.split(' ')[0];
              if (firstUrl && (firstUrl.match(/\.(jpg|jpeg|png|webp|avif)/i) || firstUrl.includes("image"))) {
                let absoluteSrc = firstUrl;
                if (firstUrl.startsWith("//")) absoluteSrc = `https:${firstUrl}`;
                else if (firstUrl.startsWith("/")) absoluteSrc = `${baseUrl}${firstUrl}`;
                else if (!firstUrl.startsWith("http")) {
                  try { absoluteSrc = new URL(firstUrl, url).href; } catch (e) {}
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

                  if (isLikelyProductImage && !product_images.includes(absoluteSrc)) {
                    product_images.push(absoluteSrc);
                  }
                }
              }
            });
          }
        });
      });

      // 2. Background images
      $("[style*='background']").each((_, el) => {
        const style = $(el).attr("style");
        const matches = style?.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/gi);
        if (matches) {
          matches.forEach(m => {
            const src = m.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/i)?.[1];
            if (src && !product_images.includes(src)) product_images.push(src);
          });
        }
      });

      // 3. JSON-LD and other script blobs
      $("script").each((_, el) => {
        const content = $(el).html();
        if (content && content.includes("http")) {
          const imgMatches = content.match(/https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"']*)?/gi);
          if (imgMatches) {
            imgMatches.forEach(match => {
              if (!product_images.includes(match) && !match.toLowerCase().includes("logo") && !match.toLowerCase().includes("icon")) {
                product_images.push(match);
              }
            });
          }
        }
      });

      // Extract Price
      const raw_price = (
        $("[class*='price'], [id*='price'], .current-price, .product-price, .amount").first().text().trim() ||
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
        error: error.message || "Failed to render and scrape the URL.",
        details: "The site might be blocking browser-based requests or the URL is invalid."
      });
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.error("Error closing browser:", e);
        }
      }
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Proxy image to bypass CORS and force download
  app.get("/api/proxy-image", async (req, res) => {
    const { url, filename } = req.query;
    if (!url || typeof url !== "string") {
      return res.status(400).send("URL is required");
    }

    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        }
      });
      
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
      
      const contentType = response.headers.get("content-type") || "image/jpeg";
      
      // Validate it's actually an image
      if (!contentType.startsWith("image/")) {
        return res.status(400).send("Target URL is not an image");
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      
      // Determine correct extension from content type
      let extension = "jpg";
      if (contentType.includes("png")) extension = "png";
      else if (contentType.includes("webp")) extension = "webp";
      else if (contentType.includes("gif")) extension = "gif";
      else if (contentType.includes("avif")) extension = "avif";
      else if (contentType.includes("svg")) extension = "svg";

      const baseFilename = filename ? filename.toString().split(".")[0] : "product-image";
      const finalFilename = `${baseFilename}.${extension}`;
      
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
      res.send(buffer);
    } catch (error) {
      console.error("Proxy error:", error);
      res.status(500).send("Failed to proxy image");
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
