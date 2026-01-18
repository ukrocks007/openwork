import { promises as fs } from 'fs';
import { join, extname, basename } from 'path';
import { createReadStream } from 'fs';
import { createHash } from 'crypto';
import OpenAI from 'openai';
import { config as dotenvConfig } from 'dotenv';

export interface FileAnalysis {
  path: string;
  name: string;
  extension: string;
  size: number;
  mimeType: string;
  category: FileCategory;
  contentType?: string;
  keywords: string[];
  hash: string;
  lastModified: Date;
  confidence: number;
}

export interface FileCategory {
  name: string;
  type: 'document' | 'image' | 'video' | 'audio' | 'archive' | 'code' | 'data' | 'other';
  subcategory?: string;
  description: string;
}

export interface ContentAnalysis {
  text?: string;
  wordCount?: number;
  language?: string;
  keywords: string[];
  topics: string[];
  entities: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  readability?: number;
  dataFormat?: 'json' | 'csv' | 'xml' | 'structured' | 'unstructured';
}

export interface DuplicateGroup {
  hash: string;
  files: FileAnalysis[];
  totalSize: number;
  recommendation: 'keep_newest' | 'keep_largest' | 'keep_all' | 'manual_review';
}

export class SmartFileAnalyzer {
  private aiClient?: OpenAI;
  
  constructor() {
    // Load environment variables
    dotenvConfig();
    
    // Initialize AI client if API key is available
    const apiKey = process.env.AI_API_KEY;
    if (apiKey && process.env.AI_PROVIDER === 'openai') {
      this.aiClient = new OpenAI({ apiKey });
    }
  }
  
  private readonly mimeTypes = new Map<string, FileCategory>([
    // Documents
    ['.pdf', { name: 'PDF Document', type: 'document', subcategory: 'pdf', description: 'Portable Document Format' }],
    ['.doc', { name: 'Word Document', type: 'document', subcategory: 'word', description: 'Microsoft Word Document' }],
    ['.docx', { name: 'Word Document', type: 'document', subcategory: 'word', description: 'Microsoft Word Document' }],
    ['.txt', { name: 'Text File', type: 'document', subcategory: 'text', description: 'Plain Text File' }],
    ['.md', { name: 'Markdown', type: 'document', subcategory: 'markdown', description: 'Markdown Document' }],
    ['.rtf', { name: 'Rich Text', type: 'document', subcategory: 'rtf', description: 'Rich Text Format' }],
    
    // Images
    ['.jpg', { name: 'JPEG Image', type: 'image', subcategory: 'photo', description: 'JPEG Image' }],
    ['.jpeg', { name: 'JPEG Image', type: 'image', subcategory: 'photo', description: 'JPEG Image' }],
    ['.png', { name: 'PNG Image', type: 'image', subcategory: 'graphic', description: 'PNG Image' }],
    ['.gif', { name: 'GIF Image', type: 'image', subcategory: 'animated', description: 'GIF Image' }],
    ['.svg', { name: 'SVG Image', type: 'image', subcategory: 'vector', description: 'Scalable Vector Graphics' }],
    ['.bmp', { name: 'Bitmap Image', type: 'image', subcategory: 'bitmap', description: 'Bitmap Image' }],
    ['.tiff', { name: 'TIFF Image', type: 'image', subcategory: 'photo', description: 'TIFF Image' }],
    
    // Videos
    ['.mp4', { name: 'MP4 Video', type: 'video', subcategory: 'mp4', description: 'MP4 Video File' }],
    ['.avi', { name: 'AVI Video', type: 'video', subcategory: 'avi', description: 'AVI Video File' }],
    ['.mov', { name: 'QuickTime Video', type: 'video', subcategory: 'mov', description: 'QuickTime Video' }],
    ['.wmv', { name: 'WMV Video', type: 'video', subcategory: 'wmv', description: 'Windows Media Video' }],
    ['.mkv', { name: 'MKV Video', type: 'video', subcategory: 'mkv', description: 'Matroska Video' }],
    
    // Audio
    ['.mp3', { name: 'MP3 Audio', type: 'audio', subcategory: 'mp3', description: 'MP3 Audio File' }],
    ['.wav', { name: 'WAV Audio', type: 'audio', subcategory: 'wav', description: 'WAV Audio File' }],
    ['.flac', { name: 'FLAC Audio', type: 'audio', subcategory: 'flac', description: 'FLAC Audio File' }],
    ['.aac', { name: 'AAC Audio', type: 'audio', subcategory: 'aac', description: 'AAC Audio File' }],
    
    // Archives
    ['.zip', { name: 'ZIP Archive', type: 'archive', subcategory: 'zip', description: 'ZIP Compressed Archive' }],
    ['.rar', { name: 'RAR Archive', type: 'archive', subcategory: 'rar', description: 'RAR Compressed Archive' }],
    ['.tar', { name: 'TAR Archive', type: 'archive', subcategory: 'tar', description: 'TAR Archive' }],
    ['.gz', { name: 'GZIP Archive', type: 'archive', subcategory: 'gzip', description: 'GZIP Compressed File' }],
    ['.7z', { name: '7-Zip Archive', type: 'archive', subcategory: '7z', description: '7-Zip Archive' }],
    
    // Code
    ['.js', { name: 'JavaScript', type: 'code', subcategory: 'javascript', description: 'JavaScript Source Code' }],
    ['.ts', { name: 'TypeScript', type: 'code', subcategory: 'typescript', description: 'TypeScript Source Code' }],
    ['.py', { name: 'Python', type: 'code', subcategory: 'python', description: 'Python Source Code' }],
    ['.java', { name: 'Java', type: 'code', subcategory: 'java', description: 'Java Source Code' }],
    ['.cpp', { name: 'C++', type: 'code', subcategory: 'cpp', description: 'C++ Source Code' }],
    ['.html', { name: 'HTML', type: 'code', subcategory: 'html', description: 'HTML Document' }],
    ['.css', { name: 'CSS', type: 'code', subcategory: 'css', description: 'CSS Stylesheet' }],
    ['.json', { name: 'JSON Data', type: 'data', subcategory: 'json', description: 'JSON Data File' }],
    ['.xml', { name: 'XML Data', type: 'data', subcategory: 'xml', description: 'XML Data File' }],
    ['.csv', { name: 'CSV Data', type: 'data', subcategory: 'csv', description: 'Comma-Separated Values' }],
    ['.sql', { name: 'SQL Script', type: 'code', subcategory: 'sql', description: 'SQL Database Script' }],
  ]);

  async analyzeFile(filePath: string): Promise<FileAnalysis> {
    try {
      const stats = await fs.stat(filePath);
      const ext = extname(filePath).toLowerCase();
      const name = basename(filePath, ext);
      
      const category = this.mimeTypes.get(ext) || {
        name: 'Unknown File',
        type: 'other' as const,
        description: 'Unknown file type'
      };

      const hash = await this.calculateFileHash(filePath);
      
      let contentAnalysis: ContentAnalysis | undefined;
      let keywords: string[] = [];
      let confidence = 0.5;

      // Analyze content for text-based files
      if (this.isTextFile(ext)) {
        try {
          contentAnalysis = await this.analyzeTextContent(filePath);
          keywords = contentAnalysis.keywords;
          confidence = 0.8;
        } catch (error) {
          console.warn(`Failed to analyze content of ${filePath}:`, error);
        }
      }

      return {
        path: filePath,
        name,
        extension: ext,
        size: stats.size,
        mimeType: category.type,
        category,
        contentType: contentAnalysis?.dataFormat,
        keywords: contentAnalysis?.keywords || [],
        hash,
        lastModified: stats.mtime,
        confidence
      };
    } catch (error) {
      throw new Error(`Failed to analyze file ${filePath}: ${error}`);
    }
  }

  async analyzeDirectory(dirPath: string): Promise<FileAnalysis[]> {
    const files: FileAnalysis[] = [];
    
    try {
      const items = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const item of items) {
        const fullPath = join(dirPath, item.name);
        
        if (item.isFile()) {
          try {
            const analysis = await this.analyzeFile(fullPath);
            files.push(analysis);
          } catch (error) {
            console.warn(`Skipping file ${fullPath}:`, error);
          }
        } else if (item.isDirectory()) {
          // Recursively analyze subdirectories
          const subFiles = await this.analyzeDirectory(fullPath);
          files.push(...subFiles);
        }
      }
    } catch (error) {
      console.error(`Failed to analyze directory ${dirPath}:`, error);
    }
    
    return files;
  }

  findDuplicates(files: FileAnalysis[]): DuplicateGroup[] {
    const hashMap = new Map<string, FileAnalysis[]>();
    
    // Group files by hash
    files.forEach(file => {
      const existing = hashMap.get(file.hash) || [];
      existing.push(file);
      hashMap.set(file.hash, existing);
    });

    // Create duplicate groups
    const duplicateGroups: DuplicateGroup[] = [];
    
    hashMap.forEach((fileList, hash) => {
      if (fileList.length > 1) {
        const totalSize = fileList.reduce((sum, file) => sum + file.size, 0);
        
        // Determine recommendation
        let recommendation: DuplicateGroup['recommendation'] = 'manual_review';
        if (fileList.length > 0 && fileList.every(f => f.name.match(/\d{4}-\d{2}-\d{2}/))) {
          recommendation = 'keep_newest'; // Date-based files
        } else if (fileList.length > 0 && fileList.some(f => f.size > fileList[0]!.size * 1.1)) {
          recommendation = 'keep_largest'; // Significant size difference
        }
        
        duplicateGroups.push({
          hash,
          files: fileList,
          totalSize,
          recommendation
        });
      }
    });
    
    return duplicateGroups;
  }

  async categorizeFiles(files: FileAnalysis[]): Promise<Map<string, FileAnalysis[]>> {
    const categories = new Map<string, FileAnalysis[]>();
    
    for (const file of files) {
      // Get enhanced category based on content analysis
      const enhancedCategory = await this.getEnhancedCategory(file);
      const categoryName = enhancedCategory.name;
      
      const existing = categories.get(categoryName) || [];
      existing.push(file);
      categories.set(categoryName, existing);
    }
    
    return categories;
  }

  private async getEnhancedCategory(file: FileAnalysis): Promise<FileCategory> {
    // Start with basic category
    let category = file.category;
    
    // Enhance based on content keywords and topics
    if (file.keywords.length > 0) {
      const keywords = file.keywords.map(k => k.toLowerCase());
      
      // Financial documents
      if (keywords.some(k => ['invoice', 'receipt', 'payment', 'bill', 'transaction', 'cost', 'price'].includes(k))) {
        category = {
          name: 'Financial Document',
          type: 'document',
          subcategory: 'financial',
          description: 'Financial document (invoice, receipt, etc.)'
        };
      }
      // Legal documents
      else if (keywords.some(k => ['contract', 'agreement', 'legal', 'terms', 'policy', 'license'].includes(k))) {
        category = {
          name: 'Legal Document',
          type: 'document',
          subcategory: 'legal',
          description: 'Legal document or contract'
        };
      }
      // Technical documentation
      else if (keywords.some(k => ['api', 'documentation', 'technical', 'specification', 'manual', 'guide'].includes(k))) {
        category = {
          name: 'Technical Documentation',
          type: 'document',
          subcategory: 'technical',
          description: 'Technical documentation or manual'
        };
      }
      // Reports
      else if (keywords.some(k => ['report', 'summary', 'analysis', 'dashboard', 'metrics', 'kpi'].includes(k))) {
        category = {
          name: 'Report',
          type: 'document',
          subcategory: 'report',
          description: 'Business or analytical report'
        };
      }
      // Presentations
      else if (keywords.some(k => ['presentation', 'slides', 'deck', 'meeting', 'conference'].includes(k))) {
        category = {
          name: 'Presentation',
          type: 'document',
          subcategory: 'presentation',
          description: 'Presentation slides or materials'
        };
      }
      // Configuration files
      else if (keywords.some(k => ['config', 'configuration', 'settings', 'environment', 'deploy'].includes(k))) {
        category = {
          name: 'Configuration File',
          type: 'code',
          subcategory: 'config',
          description: 'Configuration or settings file'
        };
      }
      // Test files
      else if (keywords.some(k => ['test', 'spec', 'mock', 'fixture', 'unit', 'integration'].includes(k))) {
        category = {
          name: 'Test File',
          type: 'code',
          subcategory: 'test',
          description: 'Test code or specification'
        };
      }
      // Documentation
      else if (keywords.some(k => ['readme', 'documentation', 'docs', 'install', 'setup', 'usage'].includes(k))) {
        category = {
          name: 'Documentation',
          type: 'document',
          subcategory: 'documentation',
          description: 'Project documentation'
        };
      }
    }
    
    // Further enhance based on file content analysis
    if (file.contentType === 'structured' && file.category.type === 'data') {
      category = {
        name: 'Structured Data',
        type: 'data',
        subcategory: 'structured',
        description: 'Structured data file with organized format'
      };
    }
    
    return category;
  }

  async generateTags(file: FileAnalysis): Promise<string[]> {
    const tags: string[] = [];
    
    // Add category-based tags
    tags.push(file.category.type);
    if (file.category.subcategory) {
      tags.push(file.category.subcategory);
    }
    
    // Add content-based keywords
    tags.push(...file.keywords);
    
    // Add size-based tags
    if (file.size < 1024) tags.push('small');
    else if (file.size < 1024 * 1024) tags.push('medium');
    else if (file.size < 10 * 1024 * 1024) tags.push('large');
    else tags.push('very-large');
    
    // Add date-based tags
    const now = new Date();
    const fileAge = now.getTime() - file.lastModified.getTime();
    const daysOld = fileAge / (1000 * 60 * 60 * 24);
    
    if (daysOld < 1) tags.push('recent');
    else if (daysOld < 7) tags.push('this-week');
    else if (daysOld < 30) tags.push('this-month');
    else if (daysOld < 365) tags.push('this-year');
    else tags.push('old');
    
    // Remove duplicates and return
    return [...new Set(tags)];
  }

  private isTextFile(ext: string): boolean {
    const textExtensions = ['.txt', '.md', '.json', '.xml', '.csv', '.js', '.ts', '.py', '.java', '.html', '.css', '.sql'];
    return textExtensions.includes(ext);
  }

  private   async analyzeTextContent(filePath: string): Promise<ContentAnalysis> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      
      // Try AI-powered analysis first
      if (this.aiClient && content.length < 10000) { // Limit content size for API
        try {
          return await this.analyzeWithAI(content, filePath);
        } catch (error) {
          console.warn(`AI analysis failed for ${filePath}, falling back to basic analysis:`, error);
        }
      }
      
      // Fallback to basic text analysis
      return this.analyzeWithBasicMethods(content, filePath);
    } catch (error) {
      throw new Error(`Failed to analyze text content: ${error}`);
    }
  }

  private async analyzeWithAI(content: string, filePath: string): Promise<ContentAnalysis> {
    if (!this.aiClient) throw new Error('AI client not available');

    const prompt = `
Analyze the following text content and provide a JSON response with:
1. Main topics (up to 5)
2. Key entities (people, places, organizations)
3. Sentiment (positive/negative/neutral)
4. Language
5. Data format (json/csv/xml/structured/unstructured)
6. Keywords (top 10)
7. Readability score (1-100)

Content:
${content.substring(0, 5000)}

Respond with valid JSON:
{
  "topics": ["topic1", "topic2"],
  "entities": ["entity1", "entity2"],
  "sentiment": "neutral",
  "language": "en",
  "dataFormat": "unstructured",
  "keywords": ["keyword1", "keyword2"],
  "readability": 65
}
`;

    const response = await this.aiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 500
    });

    const result = response.choices[0]?.message?.content;
    if (!result) throw new Error('No response from AI');

    try {
      const parsed = JSON.parse(result);
      return {
        text: content.substring(0, 1000),
        wordCount: content.split(/\s+/).length,
        topics: parsed.topics || [],
        entities: parsed.entities || [],
        sentiment: parsed.sentiment,
        language: parsed.language,
        dataFormat: parsed.dataFormat,
        keywords: parsed.keywords || [],
        readability: parsed.readability
      };
    } catch (error) {
      throw new Error(`Failed to parse AI response: ${error}`);
    }
  }

  private analyzeWithBasicMethods(content: string, filePath: string): ContentAnalysis {
    // Basic text analysis
    const words = content.split(/\s+/).filter(word => word.length > 2);
    const wordCount = words.length;
    
    // Extract keywords (simple frequency analysis)
    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      const normalized = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normalized.length > 3) {
        wordFreq.set(normalized, (wordFreq.get(normalized) || 0) + 1);
      }
    });
    
    const keywords = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
    
    // Detect data format
    let dataFormat: ContentAnalysis['dataFormat'] = 'unstructured';
    if (filePath.endsWith('.json')) dataFormat = 'json';
    else if (filePath.endsWith('.csv')) dataFormat = 'csv';
    else if (filePath.endsWith('.xml')) dataFormat = 'xml';
    else if (content.includes('{') && content.includes('}')) dataFormat = 'structured';
    
    // Simple sentiment analysis (keyword-based)
    const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic'];
    const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing', 'poor'];
    
    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    const lowerContent = content.toLowerCase();
    const positiveCount = positiveWords.filter(word => lowerContent.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lowerContent.includes(word)).length;
    
    if (positiveCount > negativeCount) sentiment = 'positive';
    else if (negativeCount > positiveCount) sentiment = 'negative';
    
    return {
      text: content.substring(0, 1000),
      wordCount,
      topics: keywords.slice(0, 5),
      entities: this.extractEntities(content),
      keywords,
      dataFormat,
      sentiment,
      language: 'en', // Default to English
      readability: this.calculateReadability(content)
    };
  }

  private calculateReadability(content: string): number {
    // Simple readability calculation based on average sentence length and word complexity
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const words = content.split(/\s+/).filter(w => w.length > 0);
    
    if (sentences.length === 0 || words.length === 0) return 50;
    
    const avgWordsPerSentence = words.length / sentences.length;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    // Simple formula: higher score for moderate sentence length and moderate word length
    let score = 100;
    
    // Penalize very long sentences
    if (avgWordsPerSentence > 25) score -= (avgWordsPerSentence - 25) * 2;
    if (avgWordsPerSentence < 10) score -= (10 - avgWordsPerSentence) * 3;
    
    // Penalize very complex words
    if (avgWordLength > 7) score -= (avgWordLength - 7) * 5;
    if (avgWordLength < 4) score -= (4 - avgWordLength) * 2;
    
    return Math.max(0, Math.min(100, score));
  }

  private extractEntities(content: string): string[] {
    const entities: string[] = [];
    
    // Simple entity extraction patterns
    const patterns = [
      { pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, type: 'Person Names' },
      { pattern: /\b\d{4}-\d{2}-\d{2}\b/g, type: 'Dates' },
      { pattern: /\b\$?\d+(,\d{3})*(\.\d{2})?\b/g, type: 'Numbers/Currency' },
      { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, type: 'Emails' },
      { pattern: /https?:\/\/[^\s]+/g, type: 'URLs' }
    ];
    
    patterns.forEach(({ pattern }) => {
      const matches = content.match(pattern);
      if (matches) {
        entities.push(...matches.slice(0, 5)); // Limit to 5 per type
      }
    });
    
    return [...new Set(entities)];
  }

  private async calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(filePath);
      
      stream.on('data', chunk => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }
}