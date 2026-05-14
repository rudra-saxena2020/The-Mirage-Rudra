import express from "express";
import cors from "cors";
import puppeteer from "puppeteer";
// @ts-ignore
import puppeteerCore from "puppeteer-core";
// @ts-ignore
import chromium from "@sparticuz/chromium";
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

  let browser: any;
  try {
    const isVercel = process.env.VERCEL === "1";

    if (isVercel) {
      browser = await puppeteerCore.launch({
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: true,
      });
    } else {
      browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
      });
    }

    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });

    if (url.includes("ounass")) {
      await page.waitForSelector(".ImageGallery", { timeout: 10000 }).catch(() => {});
      // @ts-ignore — runs in browser context via Puppeteer
      await page.evaluate(() => window.scrollBy(0, 500));
      await new Promise((r) => setTimeout(r, 1000));
    }

    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 300;
        const timer = setInterval(() => {
          // @ts-ignore
          const scrollHeight = document.body.scrollHeight;
          // @ts-ignore
          window.scrollBy(0, distance);
          totalHeight += distance;
          if (totalHeight >= scrollHeight || totalHeight > 5000) {
            clearInterval(timer);
            resolve(null);
          }
        }, 50);
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    const html = await page.content();
    const $ = cheerio.load(html);

    $("script, style, noscript, iframe, ad, .ads, #ads").remove();

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
      if (text && text.length > 2 && text.length < 500 && !text.includes("{") && !text.includes("}")) {
        raw_specs.push(text);
      }
    });

    const product_images: string[] = [];
    const baseUrl = new URL(url).origin;

    if (url.includes("ounass")) {
      $(
        'picture source[srcSet*="zoom"], picture source[srcSet*="catalog/product"], link[itemProp="url"]'
      ).each((_: any, el: any) => {
        let imgUrl = $(el).attr("srcSet") || $(el).attr("href");
        if (imgUrl) {
          imgUrl = imgUrl.split(",")[0].split(" ")[0].trim();
          if (imgUrl.startsWith("//")) imgUrl = "https:" + imgUrl;
          if (imgUrl.includes("atgcdn.ae") && !product_images.includes(imgUrl)) {
            product_images.push(imgUrl);
          }
        }
      });
    }

    $("*").each((_: any, el: any) => {
      const attributes = [
        "src", "srcset", "data-src", "data-srcset", "data-origin", "data-original",
        "data-full-size", "data-zoom", "data-image", "data-large-image", "data-high-res",
        "data-zoom-image", "data-lazy", "href", "content", "data-origin-src",
      ];
      attributes.forEach((attr: string) => {
        const val = $(el).attr(attr);
        if (val) {
          const parts = val.split(",").map((p: string) => p.trim());
          parts.forEach((part: string) => {
            const firstUrl = part.split(" ")[0];
            if (
              firstUrl &&
              (firstUrl.match(/\.(jpg|jpeg|png|webp|avif)/i) || firstUrl.includes("image"))
            ) {
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

    $("[style*='background']").each((_: any, el: any) => {
      const style = $(el).attr("style");
      const matches = style?.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/gi);
      if (matches) {
        matches.forEach((m: string) => {
          const src = m.match(/url\(["']?(https?:\/\/[^"']+)["']?\)/i)?.[1];
          if (src && !product_images.includes(src)) product_images.push(src);
        });
      }
    });

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
              product_images.push(match);
            }
          });
        }
      }
    });

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
      error: error.message || "Failed to render and scrape the URL.",
      details: "The site might be blocking browser-based requests or the URL is invalid.",
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

    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

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

    const baseFilename = filename ? filename.toString().split(".")[0] : "product-image";
    const finalFilename = `${baseFilename}.${extension}`;

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${finalFilename}"`);
    res.send(buffer);
  } catch (error: any) {
    console.error("Proxy error:", error);
    res.status(500).send("Failed to proxy image");
  }
});

export default app;
