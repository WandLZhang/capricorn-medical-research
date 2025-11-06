// Copyright 2025 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// src/utils/api.js

export const retrieveAndAnalyzeArticles = async (disease, events, methodologyContent, onProgress, numArticles = 15) => {
  try {
    // Step 1: Get PMIDs and analysis from first cloud function
    const response = await fetch(`https://us-central1-gemini-med-lit-review.cloudfunctions.net/retrieve-full-articles-live-pmc-text-embeddings-005`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        events_text: events.join('\n'),
        methodology_content: methodologyContent,
        disease: disease,
        num_articles: numArticles
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      // Add new chunk to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      let lineEnd = buffer.indexOf('\n');
      while (lineEnd !== -1) {
        const line = buffer.slice(0, lineEnd).trim();
        buffer = buffer.slice(lineEnd + 1);

        if (!line) continue;

        try {
          const data = JSON.parse(line);
          
          // Validate and process the data
          if (data && typeof data === 'object' && data.type) {
            onProgress(data);
          }
        } catch (parseError) {
          console.error('Error parsing line:', line);
          console.error('Parse error:', parseError);
        }

        lineEnd = buffer.indexOf('\n');
      }
    }
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

const API_BASE_URL = 'https://us-central1-gemini-med-lit-review.cloudfunctions.net';

export const streamChat = async (message, userId, chatId, onChunk) => {
  try {
    const response = await fetch(`${API_BASE_URL}/capricorn-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message,
        userId,
        chatId
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            break;
          }
          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              onChunk(parsed.text);
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Error in chat stream:', error);
    throw error;
  }
};
const GENERATE_CASE_URL = process.env.REACT_APP_GENERATE_CASE_URL;

/**
 * Redacts sensitive information from text while preserving medical terms, age, and gender
 * @param {string} text - The text to redact
 * @returns {Promise<string>} - A promise that resolves to the redacted text
 */
export const redactSensitiveInfo = async (text) => {
  try {
    const response = await fetch(`${API_BASE_URL}/capricorn-redact-sensitive-info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.redactedText;
  } catch (error) {
    console.error('Error redacting sensitive information:', error);
    throw new Error(`Failed to redact sensitive information: ${error.message}`);
  }
};

export const extractDisease = async (text) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pubmed-search-tester-extract-disease`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    return data.trim();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

export const extractEvents = async (text, promptContent) => {
  try {
    const response = await fetch(`${API_BASE_URL}/pubmed-search-tester-extract-events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: `${promptContent}\n\nCase input:\n${text}` }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.text();
    return data.split('"').filter(event => event.trim() && event !== ' ');
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

/**
 * Generates a sample medical case
 * @returns {Promise<string>} - A promise that resolves to a generated sample medical case
 */
export const generateSampleCase = async () => {
  try {
    const response = await fetch(GENERATE_CASE_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.medical_case;
  } catch (error) {
    console.error('Error generating sample case:', error);
    throw new Error(`Failed to generate sample case: ${error.message}`);
  }
};

/**
 * Saves a new template or updates an existing one
 * @param {Object} template - The template object to save
 * @returns {Promise<Object>} - A promise that resolves to the saved template object
 */
export const saveTemplate = async (template) => {
  try {
    const response = await fetch(`${API_BASE_URL}/templates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(template),
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.template;
  } catch (error) {
    console.error('Error saving template:', error);
    throw new Error(`Failed to save template: ${error.message}`);
  }
};

/**
 * Fetches all saved templates
 * @returns {Promise<Array>} - A promise that resolves to an array of template objects
 */
export const fetchTemplates = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/templates`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data.templates;
  } catch (error) {
    console.error('Error fetching templates:', error);
    throw new Error(`Failed to fetch templates: ${error.message}`);
  }
};

/**
 * Deletes a template
 * @param {string} templateId - The ID of the template to delete
 * @returns {Promise<void>}
 */
export const deleteTemplate = async (templateId) => {
  try {
    const response = await fetch(`${API_BASE_URL}/templates/${templateId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
    }
  } catch (error) {
    console.error('Error deleting template:', error);
    throw new Error(`Failed to delete template: ${error.message}`);
  }
};

/**
 * Generates a final analysis based on case notes, disease, events, and analyzed articles
 * @param {string} caseNotes - The patient's case notes
 * @param {string} disease - The extracted disease
 * @param {Array} events - The extracted actionable events
 * @param {Array} analyzedArticles - The analyzed articles with their metadata
 * @returns {Promise<Object>} - A promise that resolves to the final analysis object
 */
export const generateFinalAnalysis = async (caseNotes, disease, events, analyzedArticles) => {
  try {
    console.log('LOADING_DEBUG: Starting final analysis request with:', {
      case_notes: caseNotes,
      disease,
      events,
      analyzed_articles: analyzedArticles
    });

    const response = await fetch(`${API_BASE_URL}/capricorn-final-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        case_notes: caseNotes,
        disease,
        events,
        analyzed_articles: analyzedArticles
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Final analysis error response:', errorData);
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('LOADING_DEBUG: Final analysis response received');
    return data.analysis;
  } catch (error) {
    console.error('Error generating final analysis:', error);
    throw new Error(`Failed to generate final analysis: ${error.message}`);
  }
};

/**
 * Sends user feedback to the feedback endpoint
 * @param {Object} feedbackData - The feedback data object containing name, email, and feedback
 * @returns {Promise<Object>} - A promise that resolves to the response object
 */
export const sendFeedback = async (feedbackData) => {
  try {
    const response = await fetch('https://capricorn-feedback-934163632848.us-central1.run.app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedbackData),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error sending feedback:', error);
    throw new Error(`Failed to send feedback: ${error.message}`);
  }
};

/**
 * Processes a PDF lab report to extract genomic information
 * @param {string} pdfBase64 - The base64 encoded PDF content
 * @returns {Promise<Object>} - A promise that resolves to the extracted genomic data
 */
export const processLabPDF = async (pdfBase64) => {
  try {
    const response = await fetch('https://capricorn-process-lab-934163632848.us-central1.run.app', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pdf_data: pdfBase64 }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error || 'Failed to process PDF');
    }
  } catch (error) {
    console.error('Error processing lab PDF:', error);
    throw new Error(`Failed to process lab PDF: ${error.message}`);
  }
};
