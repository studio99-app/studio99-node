// Types mirror https://studio99.app/developers/openapi.json (API version 1.2).

export type Language = 'hindi' | 'marathi' | 'gujarati' | 'english' | 'hi' | 'mr' | 'gu' | 'en';
export type Mood = 'elegant' | 'festive' | 'playful' | 'romantic' | 'serious' | 'spiritual';
export type UseCase =
  | 'certificates' | 'greetings' | 'invitations' | 'logos' | 'names' | 'occasions' | 'posters' | 'quotes'
  | 'birthday' | 'casual' | 'festive' | 'formal' | 'memorial' | 'religious' | 'wedding';
export type Tier = 'FREE' | 'PRO';

export interface Usage {
  monthlyUsed: number;
  /** -1 means uncapped. */
  monthlyLimit: number;
  /** -1 means uncapped. */
  remaining: number;
  unit?: 'credits';
  creditsCharged?: number;
  license?: 'commercial' | 'preview-non-commercial';
}

export interface RateLimit {
  limit: number | null;
  remaining: number | null;
  /** Unix seconds. */
  reset: number | null;
}

/** Every method resolves to this: the payload plus the metering that came with it. */
export interface Studio99Response<T> {
  data: T;
  usage?: Usage;
  rateLimit: RateLimit;
}

export interface PngOutput { base64: string; width: number; height: number }

/** Free plan: small watermarked JPG, no commercial licence. */
export interface PreviewJpg {
  base64: string; width: number; height: number;
  format: 'jpg'; watermarked: true; commercialLicense: false;
}

// ---- generate ---------------------------------------------------------------

export interface GenerateRequest {
  /** The phrase, in the target script or in Latin letters ("shubh vivah"). */
  text: string;
  /** Omit to auto-detect. */
  language?: Language;
  /** Variants to return, 1 credit each. Default 4. */
  count?: number;
  /** "png" adds a PNG next to each SVG. Default "svg". */
  format?: 'svg' | 'png';
  pngWidth?: number;
  /** Pin every variant to one font (id from fonts()). */
  fontId?: string;
  use_case?: UseCase;
  mood?: Mood;
  engine?: 'typogen-x' | 'classic';
  align?: 'center' | 'left' | 'right';
  /** "auto" (default), 0/1 single line, 2-6 forced lines. */
  lines?: 'auto' | number;
  lineGap?: number;
  recipe?: string | string[];
  /** Same seed + same input = same output. */
  seed?: number;
  /** Classic engine only. */
  style?: string;
  /** Classic engine only. */
  weight?: string;
}

export interface GeneratedResult {
  id: string;
  fontId: string;
  fontFamily: string;
  originalText: string;
  /** The Unicode text actually rendered, after transliteration. */
  resultText: string;
  fontTier: Tier;
  source: 'generated' | 'curated';
  svg?: { path: string; width: number; height: number; svgString: string } | null;
  png?: PngOutput;
  preview?: PreviewJpg;
  commercialLicense?: boolean;
  label?: string;
  archetype?: string;
  lineCount?: number;
}

export interface GenerateResponse {
  generatedResults: GeneratedResult[];
  metadata: {
    engine?: 'typogen-x' | 'classic';
    language?: string;
    align?: string;
    lines?: string[];
    seedBase?: number;
    transliteration?: Record<string, unknown>;
    processingTimeMs?: number;
    [key: string]: unknown;
  };
}

// ---- render -----------------------------------------------------------------

export interface RenderRequest {
  text: string;
  fontId: string;
  /** 8-300, default 72. */
  fontSize?: number;
  format?: 'svg' | 'png';
  pngWidth?: number;
}

export type RenderResponse =
  | { format: 'svg'; svgString: string; width: number; height: number }
  | { format: 'png'; png: PngOutput; width: number; height: number }
  | { format: 'jpg'; preview: PreviewJpg; width: number; height: number; commercialLicense: false };

// ---- fonts ------------------------------------------------------------------

export interface FontsQuery {
  language?: Language;
  mood?: Mood;
  use_case?: UseCase;
  /** 1-100. */
  limit?: number;
}

export interface Font {
  id: string;
  name: string;
  slug?: string;
  family?: string;
  languages?: string[];
  style?: string | null;
  weight?: string | null;
  tier: Tier;
  sampleText?: string | null;
  categories?: string[];
  mood?: string[];
  suitableFor?: string[];
}

export interface FontsResponse {
  fonts: Font[];
  filters?: { language?: string; mood?: string; use_case?: string };
}

// ---- library ----------------------------------------------------------------

export interface LibrarySearchQuery {
  q?: string;
  category?: string;
  /** Language code as stored on the artwork: hi, mr, gu. */
  language?: string;
  page?: number;
  limit?: number;
}

export interface LibraryItem {
  id: string;
  shortId: string;
  slug: string;
  displayName: string;
  textEnglish?: string | null;
  textDevanagari?: string | null;
  thumbnailUrl: string;
  previewUrl?: string | null;
  pricingTier: Tier;
  category?: { id: string; name: string; slug: string } | null;
  language?: { id: string; name: string; code: string } | null;
}

export interface LibrarySearchResponse {
  results: LibraryItem[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface LibraryItemDetail extends LibraryItem {
  files?: { format: string; fileUrl: string }[];
  objectMetadata?: unknown;
  mainDeliverable?: string | null;
  createdAt?: string;
}

export interface LibraryDownload {
  /** Signed URL, valid for `expiresIn` seconds (300). */
  downloadUrl: string;
  format: 'PNG' | 'JPG' | 'SVG';
  expiresIn: number;
  pricingTier?: string;
  fileSize?: number | null;
  width?: number | null;
  height?: number | null;
  availableFormats?: string[];
  canRenderSvg?: boolean;
}

export interface LibraryRenderSvg { svgString: string; width: number; height: number; fontFamily?: string }

// ---- meta -------------------------------------------------------------------

export interface Capabilities {
  name: string;
  version: string;
  languages: string[];
  scripts: string[];
  formats: string[];
  semantics: { moods: string[]; useCases: string[] };
  endpoints: Record<string, string>;
  docs: string;
  mcp: string;
  [key: string]: unknown;
}

export interface Health { status: 'ok'; version: string; product: string }

export type ErrorCode =
  | 'AUTHENTICATION_REQUIRED' | 'INVALID_INPUT' | 'TEXT_TOO_LONG' | 'FONT_NOT_FOUND'
  | 'INVALID_FORMAT' | 'FORMAT_NOT_AVAILABLE' | 'LIBRARY_COMING_SOON'
  | 'RATE_LIMIT_EXCEEDED' | 'INSUFFICIENT_CREDITS' | 'GENERATION_FAILED'
  | 'NETWORK_ERROR' | 'TIMEOUT' | 'UNKNOWN';
