"use client";

import React, { useState, useEffect, useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

interface LegalDocFillerProps {
  documentName: string;
  templateMarkdown: string;
  onClose: () => void;
  onEditTemplate: () => void;
}

export default function LegalDocFiller({ documentName, templateMarkdown, onClose, onEditTemplate }: LegalDocFillerProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  
  // Extract unique variables looking like [Variable Name]
  const variables = useMemo(() => {
    const matches = Array.from(templateMarkdown.matchAll(/\[([a-zA-Z0-9_\s/-]+)\]/g));
    const uniqueVars = new Set(matches.map(m => m[1].trim()));
    return Array.from(uniqueVars);
  }, [templateMarkdown]);

  // Replace variables in markdown
  const filledMarkdown = useMemo(() => {
    let md = templateMarkdown;
    variables.forEach(v => {
      const val = formValues[v] || `**[${v}]**`;
      md = md.replaceAll(`[${v}]`, val);
    });
    return md;
  }, [templateMarkdown, variables, formValues]);

  // Convert to HTML
  const html = useMemo(() => {
    try {
      const rawHtml = marked.parse(filledMarkdown) as string;
      return DOMPurify.sanitize(rawHtml);
    } catch (e) {
      return "<p>Error rendering markdown</p>";
    }
  }, [filledMarkdown]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="legal-doc-filler">
      {/* Hide this entire wrapper when printing, except the preview pane which we handle via CSS */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * {
            visibility: hidden;
          }
          .legal-preview-pane, .legal-preview-pane * {
            visibility: visible;
          }
          .legal-preview-pane {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            height: auto;
            border: none;
            padding: 0;
            overflow: visible;
          }
          .legal-filler-sidebar, .legal-filler-header {
            display: none !important;
          }
        }
        
        .legal-filler-layout {
          display: flex;
          height: 100%;
          border: 1px solid var(--border);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .legal-filler-sidebar {
          width: 350px;
          background: var(--bg-alt);
          border-right: 1px solid var(--border);
          display: flex;
          flex-direction: column;
        }
        
        .legal-filler-sidebar-header {
          padding: 16px;
          border-bottom: 1px solid var(--border);
        }
        
        .legal-filler-sidebar-content {
          padding: 16px;
          flex: 1;
          overflow-y: auto;
        }
        
        .legal-filler-sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
        }
        
        .legal-preview-pane {
          flex: 1;
          background: white;
          padding: 40px;
          overflow-y: auto;
          color: black;
        }
        
        .legal-preview-content {
          max-width: 800px;
          margin: 0 auto;
          font-family: 'Inter', sans-serif;
          line-height: 1.6;
        }
        
        .legal-preview-content h1, .legal-preview-content h2, .legal-preview-content h3 {
          color: #111827;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        
        .legal-preview-content p {
          margin-bottom: 1em;
        }
        
        .legal-preview-content table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1em;
        }
        
        .legal-preview-content th, .legal-preview-content td {
          border: 1px solid #e5e7eb;
          padding: 8px 12px;
          text-align: left;
        }
        
        .legal-preview-content th {
          background: #f9fafb;
        }
        
        .legal-field {
          margin-bottom: 16px;
        }
        
        .legal-field label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-mid);
          margin-bottom: 6px;
          text-transform: uppercase;
        }
        
        .legal-field input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid var(--border);
          border-radius: 6px;
          background: var(--bg);
          color: var(--text);
        }
      `}} />
      
      <div className="legal-filler-layout">
        <div className="legal-filler-sidebar">
          <div className="legal-filler-sidebar-header">
            <h3 style={{ margin: 0, fontSize: 16 }}>Fill &amp; Download</h3>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-mid)', marginTop: 4 }}>
              {documentName}
            </p>
          </div>
          
          <div className="legal-filler-sidebar-content">
            {variables.length === 0 ? (
              <p style={{ fontSize: 14, color: 'var(--text-mid)' }}>No fillable variables found in this template.</p>
            ) : (
              variables.map(v => (
                <div key={v} className="legal-field">
                  <label>{v}</label>
                  <input 
                    type="text" 
                    value={formValues[v] || ''} 
                    onChange={e => setFormValues({...formValues, [v]: e.target.value})}
                    placeholder={`Enter ${v}`}
                  />
                </div>
              ))
            )}
          </div>
          
          <div className="legal-filler-sidebar-footer">
            <button className="btn-primary" style={{ flex: 1 }} onClick={handlePrint}>
              📄 Download PDF
            </button>
            <button className="btn-secondary" onClick={onEditTemplate}>
              Edit Template
            </button>
          </div>
        </div>
        
        <div className="legal-preview-pane">
          <div 
            className="legal-preview-content" 
            dangerouslySetInnerHTML={{ __html: html }} 
          />
        </div>
      </div>
    </div>
  );
}
