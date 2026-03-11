/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Upload, 
  FileText, 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Download,
  BookOpen,
  Layout,
  Clock,
  Target,
  FileDown,
  ChevronDown
} from 'lucide-react';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import mammoth from 'mammoth';
import { 
  Document, 
  Packer, 
  Paragraph, 
  Table, 
  TableRow, 
  TableCell, 
  WidthType, 
  HeadingLevel,
  TextRun,
  AlignmentType
} from 'docx';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface SyllabusResult {
  agenda: string;
  pacingSummary: string;
}

// --- Components ---

const Header = () => (
  <header className="border-b border-zinc-200 bg-white sticky top-0 z-10">
    <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="bg-emerald-600 p-1.5 rounded-lg">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">SyllabusAI</h1>
      </div>
      <div className="flex items-center gap-4 text-sm text-zinc-500">
        <span className="hidden sm:inline">Instructional Design Specialist</span>
      </div>
    </div>
  </header>
);

const FileUpload = ({ onFilesSelected, isProcessing }: { onFilesSelected: (files: File[]) => void, isProcessing: boolean }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onFilesSelected(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesSelected(Array.from(e.target.files));
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isProcessing && fileInputRef.current?.click()}
      className={cn(
        "relative border-2 border-dashed rounded-2xl p-8 transition-all cursor-pointer flex flex-col items-center justify-center gap-4",
        isDragging ? "border-emerald-500 bg-emerald-50/50" : "border-zinc-100 hover:border-emerald-400 hover:bg-zinc-50",
        isProcessing && "opacity-50 cursor-not-allowed"
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        multiple
        accept=".pdf,.docx,.md,text/markdown,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      />
      <div className="bg-emerald-50 p-4 rounded-full">
        <Upload className="w-6 h-6 text-emerald-600" />
      </div>
      <div className="text-center">
        <p className="text-base font-semibold text-zinc-900">
          {isProcessing ? "Processing documentation..." : "Upload technical requirements"}
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          Drag and drop PDF, DOCX, or Markdown files
        </p>
      </div>
      {isProcessing && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/60 rounded-2xl">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [files, setFiles] = useState<File[]>([]);
  const [modality, setModality] = useState<'ILT' | 'VILT' | 'Self-Paced'>('ILT');
  const [requestedDays, setRequestedDays] = useState<string>("Auto");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SyllabusResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const processFiles = async (selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3.1-pro-preview";

      const fileParts = await Promise.all(
        selectedFiles.map(async (file) => {
          const isDocx = file.name.endsWith('.docx') || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          const isPdf = file.name.endsWith('.pdf') || file.type === "application/pdf";
          const isText = file.name.endsWith('.md') || file.name.endsWith('.txt') || file.type.startsWith('text/');

          if (isDocx) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return { text: `Content from file ${file.name}:\n\n${result.value}` };
          } else if (isPdf) {
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                resolve(base64String);
              };
              reader.readAsDataURL(file);
            });
            return {
              inlineData: {
                data: base64,
                mimeType: "application/pdf"
              }
            };
          } else if (isText) {
            const text = await file.text();
            return { text: `Content from file ${file.name}:\n\n${text}` };
          } else {
            // Fallback for other types, though we should probably warn
            const text = await file.text();
            return { text: `Content from file ${file.name} (fallback text read):\n\n${text}` };
          }
        })
      );

      const prompt = `
        ### ROLE
        You are SyllabusAI, an expert Instructional Design Specialist.

        ### INPUT VARIABLES
        - Modality: ${modality}
        - Requested_Days: ${requestedDays}

        ### CORE LOGIC & PACING
        1. CALCULATE BASE TIME: Analyze the uploaded documentation to determine Total Learning Minutes based on content density (Reading: 200wpm, Narration: 130wpm).
        2. APPLY MODALITY RULES:
           - ILT: Max 390 mins/day. Add 15-min breaks every 90 mins.
           - VILT: Max 210 mins/day. Content must be chunked into 60-min blocks.
           - Self-Paced: No daily cap; organize by sequential modules.

        3. DURATION OVERRIDE (PRIORITY):
           - If Requested_Days is "Auto": Use the modality caps above to determine the length.
           - If Requested_Days is a specific number: You MUST fit all core requirements into exactly that number of days. 
             - If the content is too dense for the days requested, add a "Compression Warning" and suggest which topics should be moved to "Pre-work" or "Supplemental Reading."
             - If the content is too light, expand the "Elaborate" and "Hands-on Lab" sections to fill the time.

        ### OUTPUT FORMAT
        Provide the agenda in a Markdown table:
        | Day | Time | Module | Objective | Strategy |
        | :--- | :--- | :--- | :--- | :--- |

        Follow the table with a "Pacing Summary" section (as a ## heading) explaining why the course was structured this way based on the ${modality} and ${requestedDays} constraints.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: {
          parts: [
            ...fileParts,
            { text: prompt }
          ]
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response from AI");

      // Split text into agenda and pacing summary
      const parts = text.split(/##\s*Pacing Summary/i);
      setResult({
        agenda: parts[0].trim(),
        pacingSummary: parts[1] ? `## Pacing Summary\n${parts[1].trim()}` : ""
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while processing the files.");
    } finally {
      setIsProcessing(false);
    }
  };

  const parseMarkdownTable = (markdown: string) => {
    const lines = markdown.split('\n');
    const tableLines = lines.filter(line => line.includes('|') && !line.includes('---'));
    
    if (tableLines.length < 1) return null;

    const rows = tableLines.map(line => {
      return line.split('|')
        .map(cell => cell.trim())
        .filter(cell => cell !== '');
    });

    return rows;
  };

  const handleDownloadDocx = async () => {
    if (!result) return;

    const tableData = parseMarkdownTable(result.agenda);
    
    const renderTextWithBreaks = (text: string, isBold: boolean = false) => {
      // Handle <br> tags by splitting and adding breaks
      const parts = text.split(/<br\s*\/?>/i);
      return parts.map((part, index) => new TextRun({
        text: part,
        bold: isBold,
        size: 20,
        break: index > 0 ? 1 : 0,
      }));
    };

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "Training Agenda",
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          ...(tableData ? [
            new Table({
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
              rows: tableData.map((rowData, rowIndex) => (
                new TableRow({
                  children: rowData.map(cellData => (
                    new TableCell({
                      children: [new Paragraph({
                        children: renderTextWithBreaks(cellData, rowIndex === 0)
                      })],
                      shading: rowIndex === 0 ? { fill: "F3F4F6" } : undefined,
                      margins: { top: 100, bottom: 100, left: 100, right: 100 },
                    })
                  )),
                })
              )),
            })
          ] : [
            new Paragraph({
              children: renderTextWithBreaks(result.agenda),
            })
          ]),
          new Paragraph({
            text: "",
            spacing: { before: 400 },
          }),
          new Paragraph({
            text: "Pacing Summary",
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
          ...result.pacingSummary.split('\n').filter(l => !l.startsWith('##')).map(line => (
            new Paragraph({
              children: renderTextWithBreaks(line.replace(/^[*-]\s*/, '')),
              bullet: line.trim().startsWith('*') || line.trim().startsWith('-') ? { level: 0 } : undefined,
            })
          )),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-agenda-${new Date().toISOString().split('T')[0]}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-zinc-50 font-sans text-zinc-900">
      <Header />
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Controls */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">Training Modality</h2>
              <div className="relative mb-6">
                <select
                  value={modality}
                  onChange={(e) => setModality(e.target.value as any)}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-100 text-zinc-900 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-3 pr-10 cursor-pointer transition-all hover:bg-zinc-100"
                >
                  <option value="ILT">ILT (Instructor-Led Training)</option>
                  <option value="VILT">VILT (Virtual Instructor-Led Training)</option>
                  <option value="Self-Paced">Self-Paced (Asynchronous)</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
              </div>

              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">Duration (Days)</h2>
              <div className="relative mb-6">
                <select
                  value={requestedDays}
                  onChange={(e) => setRequestedDays(e.target.value)}
                  className="w-full appearance-none bg-zinc-50 border border-zinc-100 text-zinc-900 text-sm rounded-xl focus:ring-emerald-500 focus:border-emerald-500 block p-3 pr-10 cursor-pointer transition-all hover:bg-zinc-100"
                >
                  <option value="Auto">Auto (Calculate based on content)</option>
                  <option value="1">1 Day</option>
                  <option value="2">2 Days</option>
                  <option value="3">3 Days</option>
                  <option value="4">4 Days</option>
                  <option value="5">5 Days</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <ChevronDown className="w-4 h-4 text-zinc-400" />
                </div>
              </div>

              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">Input Documentation</h2>
              <FileUpload onFilesSelected={processFiles} isProcessing={isProcessing} />
              
              {files.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h3 className="text-xs font-medium text-zinc-400 uppercase">Selected Files</h3>
                  {files.map((file, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                      <FileText className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm truncate flex-1">{file.name}</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex gap-3 text-red-700">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4">Operational Constraints</h2>
              <ul className="space-y-4">
                <li className="flex gap-3">
                  <Target className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Requirement Traceability</p>
                    <p className="text-xs text-zinc-500">100% correlation to source requirements.</p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Layout className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Modality Focus</p>
                    <p className="text-xs text-zinc-500">
                      {modality === 'ILT' && "In-person collaboration & live demos."}
                      {modality === 'VILT' && "Digital engagement & breakout rooms."}
                      {modality === 'Self-Paced' && "Independent reading & knowledge checks."}
                    </p>
                  </div>
                </li>
                <li className="flex gap-3">
                  <Clock className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Pacing Strategy</p>
                    <p className="text-xs text-zinc-500">
                      {modality === 'ILT' && "90m blocks, 10m breaks, 1h lunch."}
                      {modality === 'VILT' && "Max 60m blocks to combat fatigue."}
                      {modality === 'Self-Paced' && "Module-based with estimated times."}
                    </p>
                  </div>
                </li>
              </ul>
            </div>
          </div>

          {/* Right Column: Output */}
          <div className="lg:col-span-8">
            {!result && !isProcessing && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-12 shadow-sm flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <div className="bg-zinc-50 p-6 rounded-full mb-6">
                  <BookOpen className="w-12 h-12 text-zinc-300" />
                </div>
                <h2 className="text-xl font-medium text-zinc-900">No Agenda Generated Yet</h2>
                <p className="text-zinc-500 mt-2 max-w-md">
                  Upload your technical documentation to begin the instructional design process.
                </p>
              </div>
            )}

            {isProcessing && (
              <div className="bg-white rounded-2xl border border-zinc-200 p-12 shadow-sm flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-6" />
                <h2 className="text-xl font-medium text-zinc-900">Analyzing Requirements</h2>
                <p className="text-zinc-500 mt-2 max-w-md">
                  Gemini is extracting learning objectives and mapping the instructional sequence...
                </p>
              </div>
            )}

            {result && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-zinc-900">Generated Training Agenda</h2>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDownloadDocx}
                      className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
                    >
                      <FileDown className="w-4 h-4" />
                      Export DOCX
                    </button>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                  <div className="p-8 prose prose-zinc max-w-none prose-table:border-collapse prose-th:bg-zinc-50 prose-th:p-4 prose-td:p-4 prose-th:text-left prose-th:font-semibold prose-th:text-zinc-700 prose-td:border-t prose-td:border-zinc-100">
                    <Markdown>{result.agenda}</Markdown>
                  </div>
                </div>

                {result.pacingSummary && (
                  <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
                    <div className="p-8 prose prose-zinc max-w-none">
                      <Markdown>{result.pacingSummary}</Markdown>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
