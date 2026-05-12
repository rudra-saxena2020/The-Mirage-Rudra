import React, { useState, useEffect, useMemo, Component } from "react";
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Search, 
  Sparkles, 
  Copy, 
  Check, 
  Loader2, 
  AlertCircle,
  ArrowRight,
  Package,
  Tag,
  FileText,
  Layers,
  History,
  Trash2,
  ExternalLink,
  Download,
  ChevronRight,
  Eye,
  Settings,
  Image as ImageIcon,
  Zap,
  X,
  Plus
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// --- Types ---

interface ScrapedData {
  raw_title: string;
  raw_description: string;
  raw_specs: string[];
  product_images: string[];
  raw_price: string;
}

interface MirageProduct {
  title: string;
  description: string;
  tags: string[];
  option1Name: string;
  option1Value: string;
  variantPrice: string;
  compareAtPrice: string;
  images: string[];
  rawCsv?: string;
  timestamp: number;
  url: string;
}

// --- Constants ---

const DEFAULT_TAGS = [
  "men", "Men-apparel", "men-tshirts", "men-shirt", "men-polo", "men-winterwear", 
  "mens-footwear", "mens-slides", "mens-loafers", "mens-sneakers", "mens-accessories", 
  "mens-wallet", "mens-backpack", "mens-jewellery", "women", "Women's handbags", 
  "women-apparel", "women-backpack", "womens-footwear", "womens-heels", "womens-flats", 
  "womens-loafers", "womens-sneakers", "outlet", "discount"
];

// --- Components ---

const Badge = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <span className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.15em] rounded-full border border-white/10 bg-white/5 ${className}`}>
    {children}
  </span>
);

const SectionHeader = ({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle?: string }) => (
  <div className="flex items-center justify-between mb-6">
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 border border-white/10">
        <Icon className="w-4 h-4 opacity-50" />
      </div>
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/40">{title}</h3>
        {subtitle && <p className="text-[9px] uppercase tracking-widest text-white/20 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  </div>
);

const GlassCard = ({ children, className = "" }: { children: React.ReactNode; className?: string }) => (
  <div className={`glass rounded-[2rem] p-8 ${className}`}>
    {children}
  </div>
);

// --- Error Boundary ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false, error: null };
  public props: ErrorBoundaryProps;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.props = props;
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-8">
          <div className="max-w-md w-full p-12 bg-white/5 border border-white/10 rounded-[3rem] text-center space-y-6 backdrop-blur-3xl">
            <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto">
              <AlertCircle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-3xl font-serif font-bold tracking-tight">Something went wrong</h2>
            <p className="text-sm text-white/40 leading-relaxed">
              An unexpected error occurred. Please try refreshing the page or contact support if the problem persists.
            </p>
            <div className="p-4 bg-black/40 rounded-2xl text-[10px] font-mono text-red-400/80 break-all text-left">
              {this.state.error?.message}
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-white text-black rounded-2xl text-[11px] font-bold uppercase tracking-widest hover:bg-mirage-gold transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function App() {
  const [url, setUrl] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"idle" | "scraping" | "transforming" | "done">("idle");
  const [scrapedData, setScrapedData] = useState<ScrapedData | null>(null);
  const [mirageProduct, setMirageProduct] = useState<MirageProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [history, setHistory] = useState<MirageProduct[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "csv" | "raw">("preview");
  
  // Tag Management
  const [customTags, setCustomTags] = useState<string[]>(DEFAULT_TAGS);
  const [newTag, setNewTag] = useState("");

  // Load history and tags from localStorage
  useEffect(() => {
    const savedHistory = localStorage.getItem("mirage_history");
    if (savedHistory) {
      try { setHistory(JSON.parse(savedHistory)); } catch (e) { console.error(e); }
    }
    
    const savedTags = localStorage.getItem("mirage_tags");
    if (savedTags) {
      try { setCustomTags(JSON.parse(savedTags)); } catch (e) { console.error(e); }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem("mirage_history", JSON.stringify(history.slice(0, 20)));
  }, [history]);

  // Save tags to localStorage
  useEffect(() => {
    localStorage.setItem("mirage_tags", JSON.stringify(customTags));
  }, [customTags]);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setIsLoading(true);
    setError(null);
    setStep("scraping");
    setScrapedData(null);
    setMirageProduct(null);

    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const text = await response.text();

      if (!response.ok) {
        let errorMessage = "Failed to scrape data";
        try {
          const errData = JSON.parse(text);
          errorMessage = errData.error || errorMessage;
        } catch (e) {
          // If not JSON, use the text we already read
          errorMessage = text.slice(0, 200) || errorMessage;
          
          // If it looks like a Vercel/Proxy error
          if (errorMessage.includes("504") || errorMessage.includes("Timeout")) {
            errorMessage = "The request timed out. This site might be too slow or complex for the current engine.";
          } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
            errorMessage = "Access forbidden. This website has strong bot protection (Cloudflare/Akamai).";
          }
        }
        throw new Error(errorMessage);
      }

      const data: ScrapedData = JSON.parse(text);
      setScrapedData(data);
      
      // Automatically proceed to transform, using manual costPrice if provided
      const finalData = {
        ...data,
        raw_price: costPrice || data.raw_price
      };
      await transformData(finalData, url);
    } catch (err: any) {
      setError(err.message);
      setStep("idle");
      setIsLoading(false);
    }
  };

    const transformData = async (data: ScrapedData, sourceUrl: string) => {
    setStep("transforming");
    
    try {
      const fallbackKeys = [
        "AIzaSyDDSG2r9LlQvJ13Z1sN-OhMAlzjdn4QhZs",
        "AIzaSyAK8Fu7M96tgzoMxVo4x-w8UchYnl8phBQ"
      ];
      
      const keysToTry = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.length > 0 
        ? [process.env.GEMINI_API_KEY, ...fallbackKeys]
        : fallbackKeys;
        
      const modelsToTry = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-1.5-pro", "gemini-2.0-flash-exp"];
      
      let response;
      let lastError;
      
      outerLoop:
      for (const key of keysToTry) {
        if (!key || key.trim() === "") continue;
        const ai = new GoogleGenAI({ apiKey: key });
        for (const modelName of modelsToTry) {
          // Try up to 2 times for each model if it's a 503
          for (let attempt = 1; attempt <= 2; attempt++) {
            try {
              console.log(`Trying ${modelName} with key starting with ${key.substring(0, 10)}... (Attempt ${attempt})`);
              
              const result = await ai.models.generateContent({
                model: modelName,
                contents: [{
                  role: "user",
                  parts: [{
                    text: `
                You are a Shopify product content generator for the brand "The Mirage".
                Your task is to generate product content STRICTLY in Mirage style.

                INPUT DATA:
                Title: ${data.raw_title}
                Description: ${data.raw_description}
                Specs: ${data.raw_specs.join(", ")}
                Cost Price: ${data.raw_price}
                
                ---
                ## 🚨 PRICING ENGINE RULES (STRICT)
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
                * Tags: Select 2-4 from this exact list: ${customTags.join(", ")}.
                * Variants: Use "Title" as Option1 Name and "Default Title" as Option1 Value.

                ---
                ## VALIDATION STEP (MANDATORY)
                Before output:
                * Check if the exact line "Now available exclusively at Mirage Retail Collective..." is present at the very end of the description.
                * Ensure "The Mirage" is NOT in the first sentence.
              `
                  }]
                }],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                      option1Name: { type: Type.STRING },
                      option1Value: { type: Type.STRING },
                      variantPrice: { type: Type.STRING, description: "Calculated selling_price" },
                      compareAtPrice: { type: Type.STRING, description: "Calculated compare_at_price" },
                    },
                    required: ["title", "description", "tags", "option1Name", "option1Value", "variantPrice", "compareAtPrice"]
                  }
                }
              });
              
              if (result && result.text) {
                response = result;
                console.log(`Success with ${modelName}`);
                break outerLoop;
              }
            } catch (e: any) {
              console.warn(`Model ${modelName} failed on attempt ${attempt}:`, e?.message || e);
              lastError = e;
              
              if (e?.message?.includes('503') && attempt === 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              } else {
                break;
              }
            }
          }
        }
      }

      if (!response || !response.text) {
        throw new Error(`All models and keys failed. Last error: ${lastError?.message || "Unknown"}`);
      }

      let result;
      try {
        let text = typeof response.text === 'function' ? response.text() : response.text;
        text = text.trim();
        if (text.startsWith("\`\`\`json")) {
           text = text.replace(/^\`\`\`json\n?/, "").replace(/\n?\`\`\`$/, "");
        } else if (text.startsWith("\`\`\`")) {
           text = text.replace(/^\`\`\`\n?/, "").replace(/\n?\`\`\`$/, "");
        }
        result = JSON.parse(text);
      } catch (parseErr) {
        console.error("Failed to parse AI response:", response.text);
        throw new Error("AI returned an invalid JSON format.");
      }
      
      // Generate CSV string - Shopify format supports multiple images via multiple rows
      // but for this standardizer we'll provide a clean format with Image Src
      const csvHeader = "Handle,Title,Body (HTML),Vendor,Type,Tags,Published,Option1 Name,Option1 Value,Variant SKU,Variant Grams,Variant Inventory Tracker,Variant Inventory Qty,Variant Inventory Policy,Variant Fulfillment Service,Variant Price,Variant Compare At Price,Variant Requires Shipping,Variant Taxable,Variant Barcode,Image Src,Image Position,Image Alt Text,Status";
      
      const handle = result.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const images = data.product_images;
      
      // First row with all data
      let csvRows = `"${handle}","${result.title.replace(/"/g, '""')}","${result.description.replace(/"/g, '""')}","","Apparel","${result.tags.join(", ")}","TRUE","${result.option1Name}","${result.option1Value}","","","shopify","100","deny","manual","${result.variantPrice}","${result.compareAtPrice}","TRUE","TRUE","","${images[0] || ""}","1","${result.title.replace(/"/g, '""')}","active"`;
      
      // Subsequent rows for additional images
      if (images.length > 1) {
        for (let i = 1; i < images.length; i++) {
          csvRows += `\n"${handle}","","","","","","","","","","","","","","","","","","","","${images[i]}","${i + 1}","",""`;
        }
      }
      
      const rawCsv = `${csvHeader}\n${csvRows}`;

      const newProduct: MirageProduct = {
        ...result,
        images,
        rawCsv,
        timestamp: Date.now(),
        url: sourceUrl
      };

      setMirageProduct(newProduct);
      setHistory(prev => [newProduct, ...prev]);
      setStep("done");
    } catch (err: any) {
      console.error("Transformation error:", err);
      setError(`AI transformation failed: ${err.message || "Please try again."}`);
      setStep("idle");
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string = "general") => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const stripHtml = (html: string) => {
    let text = html;
    // Replace <br> with newline
    text = text.replace(/<br\s*\/?>/gi, '\n');
    // Replace </li> with newline
    text = text.replace(/<\/li>/gi, '\n');
    // Replace <li> with bullet point
    text = text.replace(/<li>/gi, '• ');
    // Replace </p> with double newline
    text = text.replace(/<\/p>/gi, '\n\n');
    // Replace </h1>, </h2>, etc with double newline
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    
    // Strip all remaining tags using regex first to preserve the newlines we added
    text = text.replace(/<[^>]*>/g, '');
    
    // Use a temporary element to decode HTML entities (like &amp;, &nbsp;)
    const tmp = document.createElement("DIV");
    tmp.innerHTML = text;
    const result = tmp.textContent || tmp.innerText || "";
    
    // Clean up multiple newlines (max 2) and trim
    return result.replace(/\n{3,}/g, '\n\n').trim();
  };

  const handleDownloadImage = (url: string, index: number) => {
    const baseFilename = `product-image-${index + 1}`;
    const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(baseFilename)}`;
    
    const a = document.createElement('a');
    a.href = proxyUrl;
    // We don't set a.download here because the proxy sets Content-Disposition
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem("mirage_history");
    setShowClearConfirm(false);
  };

  const addTag = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTag && !customTags.includes(newTag)) {
      setCustomTags([...customTags, newTag]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setCustomTags(customTags.filter(t => t !== tagToRemove));
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] font-sans selection:bg-mirage-gold selection:text-black">
      {/* --- Atmospheric Background --- */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-mirage-gold/5 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-mirage-gold/5 blur-[120px] rounded-full" />
      </div>

      {/* --- Header --- */}
      <header className="h-16 sm:h-20 border-b border-white/5 px-4 sm:px-8 flex items-center justify-between sticky top-0 bg-[#050505]/60 backdrop-blur-2xl z-50">
        <div className="flex items-center gap-6">
          <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.1)]">
            <Sparkles className="text-black w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-serif font-bold tracking-[0.2em] uppercase leading-none">The Mirage</h1>
            <div className="flex items-center gap-3 mt-1.5">
              <p className="text-[9px] uppercase tracking-[0.4em] text-white/30">Standardizer Engine v2.5</p>
              <div className="w-1 h-1 rounded-full bg-mirage-gold/20" />
              <p className="text-[9px] uppercase tracking-[0.4em] text-mirage-gold/60 font-bold">Made By Rudra</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setShowHistory(!showHistory)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${
              showHistory ? 'bg-white text-black border-white' : 'bg-white/5 border-white/10 hover:border-white/30'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span className="text-[10px] font-bold uppercase tracking-widest">History</span>
          </button>
          <button 
            onClick={() => setShowSettings(true)}
            className="p-2.5 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all"
          >
            <Settings className="w-4 h-4 opacity-60" />
          </button>
        </div>
      </header>

      <div className="flex relative z-10">
        {/* --- History Drawer --- */}
        <AnimatePresence>
          {showHistory && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed left-0 top-16 sm:top-20 bottom-0 w-full sm:w-80 border-r border-white/5 bg-[#080808]/95 backdrop-blur-3xl z-40 overflow-hidden flex flex-col shadow-2xl"
            >
              <div className="p-8 flex items-center justify-between border-b border-white/5">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/40">Recent Activity</h2>
                <button onClick={() => setShowClearConfirm(true)} className="p-2 hover:bg-red-500/10 hover:text-red-400 rounded-lg transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="h-60 flex flex-col items-center justify-center text-center opacity-20">
                    <History className="w-10 h-10 mb-4" />
                    <p className="text-[10px] uppercase tracking-widest">No history yet</p>
                  </div>
                ) : (
                  history.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setMirageProduct(item);
                        setStep("done");
                      }}
                      className={`w-full text-left p-5 rounded-2xl border transition-all group relative overflow-hidden ${
                        mirageProduct?.timestamp === item.timestamp 
                        ? 'bg-white/10 border-white/20' 
                        : 'bg-white/5 border-white/5 hover:border-white/10'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <span className="text-[8px] font-bold text-mirage-gold/60 uppercase tracking-widest">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-40 transition-opacity" />
                      </div>
                      <h4 className="text-xs font-medium line-clamp-1 mb-2 group-hover:text-mirage-gold transition-colors">{item.title}</h4>
                      <div className="flex items-center justify-between">
                        <p className="text-[9px] opacity-30 truncate font-mono max-w-[120px]">{item.url}</p>
                        <span className="text-[10px] font-bold text-mirage-gold">{item.variantPrice}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* --- Clear History Confirmation Modal --- */}
        <AnimatePresence>
          {showClearConfirm && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-sm bg-[#0D0D0D] border border-white/10 rounded-[2rem] p-8 shadow-2xl text-center"
              >
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-xl font-serif font-bold mb-2">Clear History?</h3>
                <p className="text-sm text-white/40 mb-8">This action cannot be undone. All your standardized product history will be removed.</p>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setShowClearConfirm(false)}
                    className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={clearHistory}
                    className="px-6 py-3 bg-red-500 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-red-600 transition-all"
                  >
                    Clear All
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Settings Modal (Tag Management) --- */}
        <AnimatePresence>
          {showSettings && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="w-full max-w-2xl bg-[#0D0D0D] border border-white/10 rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
              >
                <div className="p-8 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-mirage-gold/10 flex items-center justify-center">
                      <Tag className="w-4 h-4 text-mirage-gold" />
                    </div>
                    <div>
                      <h2 className="text-lg font-serif font-bold tracking-widest uppercase">Tag Management</h2>
                      <p className="text-[9px] uppercase tracking-widest text-white/20">Define allowed tags for AI categorization</p>
                    </div>
                  </div>
                  <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                    <X className="w-5 h-5 opacity-40" />
                  </button>
                </div>

                <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                  <form onSubmit={addTag} className="flex gap-3 mb-8">
                    <input 
                      type="text" 
                      placeholder="Add new tag (e.g. summer-collection)"
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-5 py-3 text-sm focus:outline-none focus:border-mirage-gold/40 transition-all"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                    />
                    <button 
                      type="submit"
                      className="px-6 bg-white text-black rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-mirage-gold transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add
                    </button>
                  </form>

                  <div className="flex flex-wrap gap-2">
                    {customTags.map((tag, i) => (
                      <div 
                        key={i} 
                        className="group flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest hover:border-mirage-gold/40 transition-all"
                      >
                        {tag}
                        <button 
                          onClick={() => removeTag(tag)}
                          className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-8 border-t border-white/5 bg-white/[0.02] flex justify-between items-center">
                  <p className="text-[9px] uppercase tracking-widest text-white/20 italic">
                    These tags will be provided to the AI as the exclusive categorization options.
                  </p>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="px-8 py-3 bg-mirage-gold text-black rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-mirage-gold/10"
                  >
                    Done
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* --- Main Content --- */}
        <main className={`flex-1 p-4 sm:p-8 lg:p-12 transition-all duration-500 ${showHistory ? 'ml-0 lg:ml-80' : 'ml-0'}`}>
          <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-16">
            
            {/* Left Column: Input & Analysis */}
            <div className="xl:col-span-5 space-y-12">
              <section className="space-y-8">
                <div className="space-y-3">
                  <Badge className="text-mirage-gold border-mirage-gold/20 bg-mirage-gold/5">AI Powered</Badge>
                  <h2 className="text-4xl sm:text-5xl font-serif font-light tracking-tight leading-tight">
                    Refine your <span className="italic text-mirage-gold">Standard.</span>
                  </h2>
                  <p className="text-sm text-white/40 max-w-md leading-relaxed">
                    Transform raw e-commerce data into premium, standardized Shopify listings with our proprietary Mirage AI engine.
                  </p>
                </div>

                <form onSubmit={handleScrape} className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 relative group">
                      <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                        <Search className="w-5 h-5 text-white/20 group-focus-within:text-mirage-gold transition-colors" />
                      </div>
                      <input
                        type="url"
                        placeholder="Paste product URL here..."
                        className="w-full bg-white/5 border border-white/10 rounded-3xl py-4 sm:py-6 pl-14 sm:pl-16 pr-6 focus:outline-none focus:border-mirage-gold/30 focus:bg-white/[0.08] transition-all text-sm shadow-2xl"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                    <div className="w-full sm:w-48 relative group">
                      <div className="absolute inset-y-0 left-5 sm:left-6 flex items-center pointer-events-none">
                        <Tag className="w-5 h-5 text-white/20 group-focus-within:text-mirage-gold transition-colors" />
                      </div>
                      <input
                        type="text"
                        placeholder="Cost Price"
                        className="w-full bg-white/5 border border-white/10 rounded-3xl py-4 sm:py-6 pl-14 sm:pl-16 pr-6 focus:outline-none focus:border-mirage-gold/30 focus:bg-white/[0.08] transition-all text-sm shadow-2xl"
                        value={costPrice}
                        onChange={(e) => setCostPrice(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || !url}
                    className="w-full py-4 sm:py-6 bg-white text-black rounded-3xl text-[11px] font-bold uppercase tracking-widest hover:bg-mirage-gold hover:text-black hover:scale-[0.98] active:scale-95 transition-all disabled:opacity-50 shadow-xl flex items-center justify-center gap-3"
                  >
                    {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                      <>
                        <Zap className="w-4 h-4" />
                        Process & Standardize
                      </>
                    )}
                  </button>
                </form>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-6 bg-red-500/10 border border-red-500/20 rounded-[2rem] flex items-start gap-4 text-red-400 text-xs shadow-2xl backdrop-blur-md"
                    >
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-bold uppercase tracking-widest text-[10px]">Processing Error</p>
                        <p className="leading-relaxed opacity-80">{error}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              <AnimatePresence>
                {scrapedData && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6 sm:space-y-12"
                  >
                    <GlassCard className="space-y-6 sm:space-y-8 p-6 sm:p-8">
                      <SectionHeader icon={Layers} title="Extraction Analysis" subtitle="Raw Data Breakdown" />
                      
                      <div className="space-y-8">
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">Source Title</label>
                          <p className="text-lg font-serif italic text-white/80 leading-tight">{scrapedData.raw_title}</p>
                        </div>
                        
                        <div className="space-y-2">
                          <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">Description Snippet</label>
                          <p className="text-xs text-white/40 line-clamp-4 leading-relaxed font-light">
                            {scrapedData.raw_description}
                          </p>
                        </div>

                        {scrapedData.raw_specs.length > 0 && (
                          <div className="space-y-3">
                            <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-white/20">Technical Specs</label>
                            <div className="flex flex-wrap gap-2">
                              {scrapedData.raw_specs.slice(0, 8).map((spec, i) => (
                                <span key={i} className="px-3 py-1.5 bg-white/5 rounded-lg text-[10px] text-white/50 border border-white/5">
                                  {spec}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </GlassCard>

                    <div className="space-y-4 sm:space-y-6">
                      <SectionHeader icon={ImageIcon} title="Visual Assets" subtitle={`${scrapedData.product_images.length} images detected`} />
                      <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-8 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {scrapedData.product_images.map((img, i) => (
                          <motion.div 
                            key={i} 
                            whileHover={{ scale: 1.1 }}
                            className="aspect-square rounded-lg overflow-hidden bg-white/5 border border-white/5 group relative cursor-zoom-in"
                          >
                            <img 
                              src={img} 
                              alt="Scraped" 
                              className="w-full h-full object-cover opacity-40 group-hover:opacity-100 transition-all duration-500"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-mirage-gold/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute bottom-0.5 right-0.5 bg-black/60 backdrop-blur-md px-1 py-0.5 rounded text-[7px] font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                              #{i + 1}
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Right Column: Premium Output */}
            <div className="xl:col-span-7 mt-4 xl:mt-0">
              <div className="sticky top-24 sm:top-32">
                <div className="relative min-h-[500px] sm:min-h-[800px] bg-mirage-paper text-mirage-dark rounded-[2rem] sm:rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] sm:shadow-[0_40px_100px_rgba(0,0,0,0.5)] flex flex-col">
                  
                  {/* --- Loading Overlay --- */}
                  <AnimatePresence>
                    {(step === "scraping" || step === "transforming") && (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-20 bg-mirage-paper/95 backdrop-blur-xl flex flex-col items-center justify-center p-8 sm:p-16 text-center"
                      >
                        <div className="relative mb-10">
                          <div className="w-24 h-24 border border-mirage-dark/5 rounded-full" />
                          <motion.div 
                            animate={{ rotate: 360 }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                            className="absolute inset-0 w-24 h-24 border-t-2 border-mirage-gold rounded-full" 
                          />
                          <Sparkles className="absolute inset-0 m-auto w-8 h-8 text-mirage-gold animate-pulse" />
                        </div>
                        <h3 className="text-4xl font-serif font-light tracking-tight mb-4">
                          {step === "scraping" ? "Extracting Essence" : "Refining for The Mirage"}
                        </h3>
                        <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">
                          <Zap className="w-3 h-3 text-mirage-gold fill-mirage-gold" />
                          Neural Transformation Active
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {mirageProduct ? (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex-1 flex flex-col"
                    >
                      {/* --- Product Header --- */}
                      <div className="p-6 sm:p-12 pb-6 border-b border-mirage-dark/5">
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-6 sm:mb-8 gap-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-3">
                              <span className="px-3 py-1 bg-mirage-dark text-white rounded-full text-[9px] font-bold uppercase tracking-widest">Shopify Ready</span>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-mirage-dark/30">
                                {new Date(mirageProduct.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <h2 className="text-3xl sm:text-5xl font-serif font-bold tracking-tight leading-[1.05] text-mirage-dark">
                              {mirageProduct.title}
                            </h2>
                          </div>
                          <div className="flex gap-3 self-end sm:self-auto">
                            <button 
                              onClick={() => copyToClipboard(mirageProduct.title, "title")}
                              className="p-4 sm:p-5 bg-white border border-mirage-dark/10 text-mirage-dark rounded-2xl sm:rounded-3xl hover:bg-mirage-gold hover:text-white hover:scale-105 active:scale-95 transition-all shadow-xl group flex items-center gap-3"
                              title="Copy Title"
                            >
                              {copiedId === "title" ? <Check className="w-5 h-5" /> : <FileText className="w-5 h-5 group-hover:rotate-6 transition-transform" />}
                              <span className="hidden sm:inline text-[10px] font-bold uppercase tracking-widest">Copy Title</span>
                            </button>
                            <button 
                              onClick={() => copyToClipboard(mirageProduct.rawCsv || "", "csv")}
                              className="p-4 sm:p-5 bg-mirage-dark text-white rounded-2xl sm:rounded-3xl hover:bg-mirage-gold hover:scale-105 active:scale-95 transition-all shadow-2xl group"
                              title="Copy Full CSV"
                            >
                              {copiedId === "csv" ? <Check className="w-5 h-5 sm:w-6 sm:h-6" /> : <Copy className="w-5 h-5 sm:w-6 sm:h-6 group-hover:rotate-6 transition-transform" />}
                            </button>
                          </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex gap-4 sm:gap-8 border-b border-mirage-dark/5 overflow-x-auto custom-scrollbar-light">
                          {["preview", "csv", "raw"].map((tab) => (
                            <button
                              key={tab}
                              onClick={() => setActiveTab(tab as any)}
                              className={`pb-4 text-[10px] font-bold uppercase tracking-[0.2em] transition-all relative ${
                                activeTab === tab ? 'text-mirage-dark' : 'text-mirage-dark/30 hover:text-mirage-dark/60'
                              }`}
                            >
                              {tab}
                              {activeTab === tab && (
                                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-mirage-gold" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* --- Tab Content --- */}
                      <div className="flex-1 overflow-y-auto p-6 sm:p-12 pt-6 sm:pt-8 custom-scrollbar-light">
                        <AnimatePresence mode="wait">
                          {activeTab === "preview" && (
                            <motion.div
                              key="preview"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8 sm:space-y-12"
                            >
                              {/* Summary Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
                                <div className="p-6 bg-mirage-dark/[0.03] rounded-[2rem] border border-mirage-dark/5">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-mirage-dark/30 mb-3">Price Point</p>
                                  <div className="flex items-baseline gap-3">
                                    <p className="text-2xl font-serif italic">{mirageProduct.variantPrice} <span className="text-xs opacity-40 not-italic">INR</span></p>
                                    <p className="text-xs text-red-500/50 line-through font-serif italic">{mirageProduct.compareAtPrice}</p>
                                  </div>
                                </div>
                                <div className="p-6 bg-mirage-dark/[0.03] rounded-[2rem] border border-mirage-dark/5">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-mirage-dark/30 mb-3">Variant</p>
                                  <p className="text-sm font-medium truncate">{mirageProduct.option1Value}</p>
                                </div>
                                <div className="p-6 bg-mirage-dark/[0.03] rounded-[2rem] border border-mirage-dark/5">
                                  <p className="text-[9px] font-bold uppercase tracking-widest text-mirage-dark/30 mb-3">Metadata</p>
                                  <p className="text-sm font-medium">{mirageProduct.tags.length} <span className="text-xs opacity-40">Tags</span></p>
                                </div>
                              </div>

                              {/* Live Preview */}
                              <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <Eye className="w-4 h-4 text-mirage-gold" />
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">Editorial Preview</h4>
                                  </div>
                                  <button 
                                    onClick={() => copyToClipboard(stripHtml(mirageProduct.description), "desc")}
                                    className="flex items-center gap-2 px-4 py-2 bg-mirage-dark/5 border border-mirage-dark/5 rounded-full text-[9px] font-bold uppercase tracking-widest text-mirage-dark/40 hover:bg-mirage-dark hover:text-white transition-all group"
                                  >
                                    {copiedId === "desc" ? <Check className="w-3 h-3 text-mirage-gold" /> : <Copy className="w-3 h-3" />}
                                    {copiedId === "desc" ? "Copied" : "Copy Description"}
                                  </button>
                                </div>
                                <div className="p-12 bg-white rounded-[3rem] border border-mirage-dark/5 shadow-inner relative overflow-hidden">
                                  <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
                                    <h1 className="text-8xl font-serif font-bold uppercase">Mirage</h1>
                                  </div>
                                  <div 
                                    className="prose prose-sm sm:prose-lg max-w-none text-mirage-dark/80 font-serif leading-relaxed
                                      prose-p:mb-6 prose-ul:mb-6 prose-li:mb-2 prose-strong:font-bold prose-strong:text-mirage-dark"
                                    dangerouslySetInnerHTML={{ __html: mirageProduct.description }}
                                  />
                                </div>
                              </section>
                              {/* Image Gallery */}
                              <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <ImageIcon className="w-4 h-4 text-mirage-gold" />
                                    <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">Standardized Assets</h4>
                                  </div>
                                  {mirageProduct.images.length > 0 && (
                                    <button 
                                      onClick={() => mirageProduct.images.forEach((img, idx) => handleDownloadImage(img, idx))}
                                      className="text-[9px] font-bold uppercase tracking-widest text-mirage-dark/30 hover:text-mirage-gold transition-colors flex items-center gap-2"
                                    >
                                      <Download className="w-3 h-3" /> Download All
                                    </button>
                                  )}
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                  {mirageProduct.images.map((img, i) => (
                                    <div key={i} className="aspect-[3/4] rounded-2xl overflow-hidden bg-mirage-dark/5 border border-mirage-dark/5 relative group">
                                      <img 
                                        src={img} 
                                        alt={`${mirageProduct.title} - View ${i + 1}`} 
                                        className="w-full h-full object-cover transition-opacity duration-300"
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          const target = e.target as HTMLImageElement;
                                          target.src = "https://placehold.co/600x800/0A0A0A/C5A059?text=Image+Unavailable";
                                          target.className = "w-full h-full object-contain opacity-40 p-4";
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3">
                                        <div className="flex items-center justify-between">
                                          <div className="bg-white/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-mono text-black">
                                            #{i + 1}
                                          </div>
                                          <button 
                                            onClick={() => handleDownloadImage(img, i)}
                                            className="p-2 bg-white text-black rounded-full hover:bg-mirage-gold transition-colors shadow-lg"
                                            title="Download Image"
                                          >
                                            <Download className="w-3 h-3" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </section>

                              {/* Tags */}
                              <section className="space-y-6">
                                <div className="flex items-center gap-3">
                                  <Tag className="w-4 h-4 text-mirage-gold" />
                                  <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">Categorization</h4>
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {mirageProduct.tags.map((tag, i) => (
                                    <span 
                                      key={i} 
                                      className="px-6 py-3 bg-mirage-dark text-white rounded-full text-[10px] font-bold tracking-[0.2em] uppercase hover:bg-mirage-gold transition-colors cursor-default"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              </section>
                            </motion.div>
                          )}

                          {activeTab === "csv" && (
                            <motion.div
                              key="csv"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">Shopify CSV Structure</h4>
                                <button 
                                  onClick={() => copyToClipboard(mirageProduct.rawCsv || "", "csv-tab")}
                                  className="text-[10px] font-bold uppercase tracking-widest text-mirage-gold hover:underline"
                                >
                                  {copiedId === "csv-tab" ? "Copied!" : "Copy All"}
                                </button>
                              </div>
                              <div className="bg-mirage-dark text-white p-8 rounded-[2rem] font-mono text-xs overflow-x-auto leading-loose shadow-2xl">
                                <div className="grid grid-cols-[120px_1fr] gap-y-4">
                                  <span className="text-white/30 uppercase tracking-widest">Title:</span>
                                  <span className="text-mirage-gold">{mirageProduct.title}</span>
                                  
                                  <span className="text-white/30 uppercase tracking-widest">Tags:</span>
                                  <span>{mirageProduct.tags.join(", ")}</span>
                                  
                                  <span className="text-white/30 uppercase tracking-widest">Option 1:</span>
                                  <span>{mirageProduct.option1Name} ({mirageProduct.option1Value})</span>
                                  
                                  <span className="text-white/30 uppercase tracking-widest">Price:</span>
                                  <span className="text-green-400">{mirageProduct.variantPrice}</span>

                                  <span className="text-white/30 uppercase tracking-widest">Compare At:</span>
                                  <span className="text-red-400 line-through">{mirageProduct.compareAtPrice}</span>
                                  
                                  <div className="flex flex-col gap-2">
                                    <div className="flex items-center justify-between">
                                      <span className="text-white/30 uppercase tracking-widest">Description:</span>
                                      <button 
                                        onClick={() => copyToClipboard(stripHtml(mirageProduct.description), "desc-inner")}
                                        className="text-[8px] font-bold uppercase tracking-widest text-mirage-gold/60 hover:text-mirage-gold transition-colors"
                                      >
                                        {copiedId === "desc-inner" ? "Copied" : "Copy Text"}
                                      </button>
                                    </div>
                                    <div className="text-[10px] opacity-60 break-all bg-white/5 p-4 rounded-xl">
                                      {mirageProduct.description}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}

                          {activeTab === "raw" && (
                            <motion.div
                              key="raw"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-6"
                            >
                              <div className="flex items-center justify-between">
                                <h4 className="text-[10px] font-bold uppercase tracking-[0.3em] text-mirage-dark/30">Raw CSV String</h4>
                                <button 
                                  onClick={() => copyToClipboard(mirageProduct.rawCsv || "", "raw-csv")}
                                  className="text-[10px] font-bold uppercase tracking-widest text-mirage-gold hover:underline"
                                >
                                  {copiedId === "raw-csv" ? "Copied!" : "Copy String"}
                                </button>
                              </div>
                              <div className="bg-mirage-dark text-white p-8 rounded-[2rem] font-mono text-[10px] overflow-x-auto break-all leading-relaxed opacity-80">
                                {mirageProduct.rawCsv}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* --- Footer Actions --- */}
                      <div className="p-12 pt-8 border-t border-mirage-dark/5 flex items-center justify-between bg-mirage-dark/[0.02]">
                        <a 
                          href={mirageProduct.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-mirage-dark/30 hover:text-mirage-dark transition-colors group"
                        >
                          <ExternalLink className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" /> 
                          Source Reference
                        </a>
                        <div className="flex gap-8">
                          <button 
                            onClick={() => {
                              const blob = new Blob([mirageProduct.rawCsv || ""], { type: 'text/csv' });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = `mirage-${mirageProduct.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
                              a.click();
                            }}
                            className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] hover:text-mirage-gold transition-colors"
                          >
                            <Download className="w-4 h-4" /> Export CSV
                          </button>
                          <button 
                            onClick={() => copyToClipboard(mirageProduct.rawCsv || "", "finalize")}
                            className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] group"
                          >
                            {copiedId === "finalize" ? "Copied" : "Finalize"} <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform text-mirage-gold" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
                      <div className="w-32 h-32 border border-mirage-dark/5 rounded-full flex items-center justify-center mb-10 opacity-20 relative">
                        <Sparkles className="w-12 h-12" />
                        <div className="absolute inset-0 border border-mirage-dark/10 rounded-full animate-ping" />
                      </div>
                      <h3 className="text-5xl font-serif font-light tracking-tight mb-6 uppercase opacity-10">The Mirage</h3>
                      <p className="text-[11px] max-w-xs uppercase tracking-[0.4em] leading-relaxed opacity-20">
                        Awaiting source data to generate your premium standardized listing.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* --- Footer Credit --- */}
      <footer className="py-12 border-t border-white/5 flex flex-col items-center gap-4 relative z-10">
        <div className="w-px h-12 bg-gradient-to-b from-mirage-gold/40 to-transparent mb-4" />
        <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-white/20">
          Made By <span className="text-white/60 hover:text-mirage-gold transition-colors cursor-default">Rudra</span>
        </p>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.05);
          border-radius: 10px;
        }
        .custom-scrollbar-light::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar-light::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar-light::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.05);
          border-radius: 10px;
        }
      `}} />
    </div>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
