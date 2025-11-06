# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

import functions_framework
from flask import jsonify, request, Response
from google import genai
from google.genai import types
from google.cloud import bigquery
import json
import logging
import time
import math
import os
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global variable to store journal impact data
journal_impact_data = {}

def fetch_journal_impact_data():
    """Fetch journal impact data from BigQuery and store in memory."""
    global journal_impact_data
    project_id = os.environ.get('GENAI_PROJECT_ID', 'gemini-med-lit-review')
    journal_dataset = os.environ.get('JOURNAL_DATASET', 'journal_rank')
    query = f"""
    SELECT
      `title`,
      `sjr`
    FROM
      `{project_id}.{journal_dataset}.scimagojr_2024`
    ORDER BY 
      sjr DESC
    """
    try:
        query_job = bq_client.query(query)
        results = query_job.result()
        
        # Convert to dictionary for faster lookups
        journal_impact_data = {row['title']: float(row['sjr']) for row in results}
        logger.info(f"Loaded {len(journal_impact_data)} journal impact records")
    except Exception as e:
        logger.error(f"Error fetching journal impact data: {str(e)}")

# Initialize clients with environment variables
client = genai.Client(
    vertexai=True,
    project=os.environ.get('GENAI_PROJECT_ID', 'gemini-med-lit-review'),
    location=os.environ.get('LOCATION', 'us-central1'),
)
bq_client = bigquery.Client(project=os.environ.get('BIGQUERY_PROJECT_ID', 'playground-439016'))

def normalize_journal_score(sjr):
    """Normalize journal SJR score to points between 0-25 to align with other scoring metrics."""
    if not sjr:
        return 0
    # Use log scale to handle large range of SJR values (0 to 106094)
    # Add 1 to avoid log(0)
    # Multiply by 5 to align with other point values (5, 10, 15, 25)
    normalized = math.log(sjr + 1) * 5
    # Cap at 25 points to match the scale of other point calculations
    return min(normalized, 25)

def calculate_points(metadata, query_disease=None):
    """Calculate points based on article metadata and return both total and breakdown."""
    points = 0
    breakdown = {}
    
    # Journal impact points
    if metadata.get('journal_title') and metadata.get('journal_sjr'):
        journal_title = metadata['journal_title']
        sjr = float(metadata['journal_sjr'])
        if sjr > 0:
            impact_points = normalize_journal_score(sjr)
            points += impact_points
            breakdown['journal_impact'] = impact_points
            logger.info(f"Journal '{journal_title}' has SJR {sjr}, awarded {impact_points:.2f} points")
        else:
            logger.info(f"Journal '{journal_title}' has no SJR score")
    
    # Year-based points: -5 points per year difference from current year
    current_year = datetime.now().year
    if metadata.get('year'):
        try:
            article_year = int(metadata.get('year'))
            year_diff = current_year - article_year
            year_points = -5 * year_diff
            points += year_points
            breakdown['year'] = year_points
        except (ValueError, TypeError):
            # If year is not a valid integer, skip year-based points
            pass
    
    # Disease Match: +50 points
    if metadata.get('disease_match'):
        points += 50
        breakdown['disease_match'] = 50
    
    # Pediatric Focus: +20 points
    if metadata.get('pediatric_focus'):
        points += 20
        breakdown['pediatric_focus'] = 20
    
    # Paper Type: +40 points for clinical trial, -5 points for review
    paper_type = metadata.get('paper_type', '').lower()
    if 'clinical trial' in paper_type:
        points += 40
        breakdown['paper_type'] = 40
    elif 'review' in paper_type:
        points -= 5
        breakdown['paper_type'] = -5
    
    # Actionable Events: +15 points per matched event
    actionable_events = metadata.get('actionable_events', [])
    matched_events = sum(1 for event in actionable_events if event.get('matches_query', False))
    if matched_events > 0:
        event_points = matched_events * 15
        points += event_points
        breakdown['actionable_events'] = event_points
    
    # Drugs Tested: +5 points
    if metadata.get('drugs_tested'):
        points += 5
        breakdown['drugs_tested'] = 5
    
    # Drug Results: +50 points for actual positive treatment shown
    if metadata.get('treatment_shown'):
        points += 50
        breakdown['treatment_shown'] = 50
    
    # Cell Studies: +5 points
    if metadata.get('cell_studies'):
        points += 5
        breakdown['cell_studies'] = 5
    
    # Mice Studies: +10 points
    if metadata.get('mice_studies'):
        points += 10
        breakdown['mice_studies'] = 10
    
    # Case Report: +5 points
    if metadata.get('case_report'):
        points += 5
        breakdown['case_report'] = 5
    
    # Series of Case Reports: +10 points
    if metadata.get('series_of_case_reports'):
        points += 10
        breakdown['series_of_case_reports'] = 10
    
    # Clinical Study: +15 points
    if metadata.get('clinical_study'):
        points += 15
        breakdown['clinical_study'] = 15
    
    # Clinical Study on Children: +20 points
    if metadata.get('clinical_study_on_children'):
        points += 20
        breakdown['clinical_study_on_children'] = 20
    
    # Novelty: +10 points
    if metadata.get('novelty'):
        points += 10
        breakdown['novelty'] = 10
    
    return points, breakdown

def create_gemini_prompt(article_text, pmcid, methodology_content=None, disease=None, events_text=None):
    # Add disease and events context to the prompt if provided
    disease_context = f"\nThe patient's disease is: {disease}\n" if disease else ""
    events_context = f"\nThe patient's actionable events are: {events_text}\n" if events_text else ""
    
    # Create journal context string
    journal_context = ""
    for title, sjr in journal_impact_data.items():
        journal_context += f"- {title}: {sjr}\n"

    # Default methodology if none provided
    if not methodology_content:
        methodology_content = """You are an expert pediatric oncologist and you are the chair of the International Leukemia Tumor Board. Your goal is to evaluate full research articles related to oncology, especially those concerning pediatric leukemia, to identify potential advancements in treatment and understanding of the disease.{disease_context}{events_context}

Journal Impact Data (SJR scores):
The following is a list of journal titles and their SJR scores. When extracting the journal title from the article, find the best matching title from this list and use its SJR score. If no match is found, use 0 as the SJR score.

Journal Titles and Scores:
{journal_context}

<Article>
{article_text}
</Article>

<Instructions>
Your task is to read the provided full article and extract key information, and then assess the article's relevance and potential impact. You will generate a JSON object containing metadata and analysis. Please use a consistent JSON structure.

As an expert oncologist:
1. Evaluate if the article's disease focus matches the patient's disease. Set disease_match to true if the article's cancer type is relevant to the patient's condition.
2. Analyze treatment outcomes. Set treatment_shown to true if the article demonstrates positive treatment results.
3. For each actionable event you find in the article, determine if it matches any of the patient's actionable events. For genetic mutations, create two separate events:
   - When you find a general mutation mention (e.g., if the article mentions just "NRAS" when patient has "NRAS (p.Gln61Lys)"), create an event with the general form and set matches_query=true
   - When you find an exact mutation match (e.g., if the article mentions "NRAS (p.Gln61Lys)" like it appears in the patient's events), create another event with the exact mutation and set matches_query=true

Please analyze the article and provide a JSON response with the following structure:

{
  "article_metadata": {
    "title": "...",
    "year": "...",
    "journal_title": "...",  // Extract the journal title from the article
    "journal_sjr": 0,        // Look up the SJR score from the provided list. Use the score of the best matching journal title, or 0 if no match found
    "cancer_focus": true/false,
    "pediatric_focus": true/false,
    "type_of_cancer": "...",
    "disease_match": true/false,      // Set to true if article's disease is relevant to patient's condition
    "paper_type": "...",
    "actionable_events": [
      {
        "event": "...",
        "matches_query": true/false   // Set to true if this event matches any of the patient's actionable events
      }
    ],
    "drugs_tested": true/false,
    "drug_results": ["...", "..."],   // List of treatment outcomes
    "treatment_shown": true/false,    // Set to true if article shows positive treatment results
    "cell_studies": true/false,
    "mice_studies": true/false,
    "case_report": true/false,
    "series_of_case_reports": true/false,
    "clinical_study": true/false,
    "clinical_study_on_children": true/false,
    "novelty": true/false
  }
}

Important: The response must be valid JSON and follow this exact structure. Do not include any explanatory text, markdown formatting, or code blocks. Return only the raw JSON object."""

    # Log the article text format
    logger.info(f"Article text to be inserted:\n{article_text}")
    
    # Replace all placeholders
    prompt = methodology_content
    prompt = prompt.replace("{article_text}", article_text)
    prompt = prompt.replace("{disease}", disease if disease else "")
    prompt = prompt.replace("{events}", events_text if events_text else "")
    prompt = prompt.replace("{journal_context}", journal_context)
    
    # Log the final prompt
    logger.info(f"Final prompt with article inserted:\n{prompt}")
    
    return prompt

def analyze_with_gemini(article_text, pmcid, methodology_content=None, disease=None, events_text=None):
    # Create prompt with JSON-only instruction
    prompt = create_gemini_prompt(article_text, pmcid, methodology_content, disease, events_text)
    prompt += "\n\nIMPORTANT: Return ONLY the raw JSON object. Do not include any explanatory text, markdown formatting, or code blocks. The response should start with '{' and end with '}' with no other characters before or after."
    
    # Configure Gemini
    model = "gemini-2.5-pro"
    generate_content_config = types.GenerateContentConfig(
        temperature=0,
        top_p=0.95,
        max_output_tokens=8192,
        response_modalities=["TEXT"],
        safety_settings=[
            types.SafetySetting(category=cat, threshold="OFF")
            for cat in ["HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_DANGEROUS_CONTENT", 
                      "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_HARASSMENT"]
        ]
    )
    
    # Create content with prompt
    contents = [types.Content(role="user", parts=[{"text": prompt}])]
    
    # Initialize retry parameters
    base_delay = 5  # Start with 5 seconds
    attempt = 0
    
    while True:  # Keep trying indefinitely
        try:
            response = client.models.generate_content(
                model=model,
                contents=contents,
                config=generate_content_config,
            )
            break  # If successful, break out of the retry loop
        except Exception as e:
            error_str = str(e)
            if "429 RESOURCE_EXHAUSTED" in error_str:
                attempt += 1
                # Calculate exponential backoff delay with a maximum of 5 minutes
                delay = min(base_delay * (2 ** (attempt - 1)), 300)  # Cap at 300 seconds (5 minutes)
                print(f"Received RESOURCE_EXHAUSTED error. Attempt {attempt}. Waiting {delay} seconds before retry...")
                time.sleep(delay)
            else:
                # If it's not a 429 error, raise immediately
                raise
    
    try:
        # Log Gemini's raw response with clear markers
        logger.info("========== RAW GEMINI RESPONSE START ==========")
        logger.info(response.text)
        logger.info("========== RAW GEMINI RESPONSE END ============")
        
        # Clean up response text
        text = response.text.strip()
        
        # Try to find JSON object
        try:
            # First try to find JSON between ```json and ``` markers
            if '```json' in text:
                text = text.split('```json')[1].split('```')[0].strip()
            # If that fails, try to find JSON between { and }
            elif '{' in text and '}' in text:
                start = text.find('{')
                end = text.rfind('}') + 1
                text = text[start:end]
            
            # Remove any non-JSON text before or after
            text = text.strip()
            
            # Log cleaned text before parsing
            logger.info("========== CLEANED TEXT START ==========")
            logger.info(text)
            logger.info("========== CLEANED TEXT END ============")
            
            # Try to parse as JSON
            try:
                analysis = json.loads(text)
                logger.info("Successfully parsed JSON")
            except json.JSONDecodeError as e:
                logger.error(f"JSON parse error at position {e.pos}: {e.msg}")
                logger.error(f"Error context: {text[max(0, e.pos-50):min(len(text), e.pos+50)]}")
                raise
            
            # Validate required fields
            if not isinstance(analysis, dict) or 'article_metadata' not in analysis:
                logger.error("Invalid JSON structure - missing article_metadata")
                return None
                
            metadata = analysis['article_metadata']
            required_fields = ['title', 'journal_title', 'journal_sjr', 'cancer_focus', 'type_of_cancer', 'paper_type', 'actionable_events']
            for field in required_fields:
                if field not in metadata:
                    logger.error(f"Invalid JSON structure - missing {field}")
                    return None
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON: {str(e)}")
            logger.error(f"Cleaned response was: {text}")
            return None
        
        # Process metadata and calculate points
        if 'article_metadata' in analysis:
            metadata = analysis['article_metadata']
            # Add PMCID and generate link
            metadata['PMCID'] = pmcid
            metadata['link'] = f'https://www.ncbi.nlm.nih.gov/pmc/articles/{pmcid}/'
            
            # Calculate points with disease information
            points, point_breakdown = calculate_points(metadata, disease)
            metadata['overall_points'] = points
            metadata['point_breakdown'] = point_breakdown
            
            # Store full article text at top level
            analysis['full_article_text'] = article_text
            logger.info("Added full article text and calculated points")
        
        return analysis
    except Exception as e:
        logger.error(f"Error analyzing article with Gemini: {str(e)}")
        return None

def create_bq_query(events_text, num_articles=15):
    project_id = os.environ.get('BIGQUERY_PROJECT_ID', 'wz-capricorn-run-through')
    model_dataset = os.environ.get('MODEL_DATASET', 'model')
    # Use the new PMC daily publish table with gemini-embedding-001
    pubmed_table = 'playground-439016.pmc_daily_publish.pmc_articles_gemini_publish'
    embedding_model = f'{project_id}.{model_dataset}.gemini_embedding_001'
    
    return f"""
    DECLARE query_text STRING;
    SET query_text = \"\"\"
    {events_text}
    \"\"\";

    WITH vector_results AS (
        SELECT base.pmc_id, base.pmid, base.article_text, distance 
        FROM VECTOR_SEARCH(
            TABLE `{pubmed_table}`, 
            'ml_generate_embedding_result', 
            (SELECT ml_generate_embedding_result 
             FROM ML.GENERATE_EMBEDDING(
                 MODEL `{embedding_model}`, 
                 (SELECT query_text AS content)
             )), 
            top_k => {num_articles}
        )
    )
    SELECT * FROM vector_results
    ORDER BY distance
    """

def stream_response(events_text, methodology_content=None, disease=None, num_articles=15):
    try:
        # Execute BigQuery
        # Execute BigQuery and log results
        query = create_bq_query(events_text, num_articles)
        query_job = bq_client.query(query)
        results = list(query_job.result())
        total_articles = len(results)
        
        # Get array of PMCIDs from BigQuery results and stream immediately
        retrieved_pmcids = [row['pmc_id'] for row in results]
        print(f"Retrieved PMCIDs: {retrieved_pmcids}")

        # Stream PMCIDs immediately
        yield json.dumps({
            "type": "pmcids",
            "data": {
                "pmcids": retrieved_pmcids
            }
        }) + "\n"

        # Stream initial metadata
        yield json.dumps({
            "type": "metadata",
            "data": {
                "total_articles": total_articles,
                "current_article": 0,
                "status": "processing"
            }
        }) + "\n"

        # Process each article
        for idx, row in enumerate(results, 1):
            pmcid = row['pmc_id']  # This is pmc_id from the query result
            pmid = row['pmid']   # This is pmid from the query result
            content = row['article_text']
            
            # Log article details before analysis
            logger.info(f"Processing article:\nPMCID: {pmcid}\nContent length: {len(content)}\nFirst 200 chars: {content[:200]}")
            
            # Add delay between articles
            if idx > 1:  # Don't delay for first article
                logger.info("Waiting 5 seconds before next analysis...")
                time.sleep(5)
            
            # Analyze with Gemini and prepare complete response object
            try:
                # Pass PMCID for URL generation and metadata
                analysis = analyze_with_gemini(content, pmcid, methodology_content, disease, events_text)
                if analysis:
                    # Create complete response object
                    response_obj = {
                        "type": "article_analysis",
                        "data": {
                            "progress": {
                                "article_number": idx,
                                "total_articles": total_articles
                            },
                            "analysis": analysis
                        }
                    }
                    # Send complete JSON object with newline
                    yield json.dumps(response_obj) + "\n"
                else:
                    logger.error(f"Failed to analyze article {row['pmc_id']}")
                    error_obj = {
                        "type": "error",
                        "data": {
                            "message": f"Failed to analyze article {row['pmc_id']}",
                            "article_number": idx,
                            "total_articles": total_articles
                        }
                    }
                    yield json.dumps(error_obj) + "\n"
            except Exception as e:
                logger.error(f"Error processing article {row['pmc_id']}: {str(e)}")
                yield json.dumps({
                    "type": "error",
                    "data": {
                        "message": f"Error processing article {row['pmc_id']}: {str(e)}",
                        "article_number": idx,
                        "total_articles": total_articles
                    }
                }) + "\n"

        # Send completion message as complete JSON object
        completion_obj = {
            "type": "metadata",
            "data": {
                "total_articles": total_articles,
                "current_article": total_articles,
                "status": "complete"
            }
        }
        yield json.dumps(completion_obj) + "\n"

    except Exception as e:
        logger.error(f"Error in stream_response: {str(e)}")
        yield json.dumps({
            "type": "error",
            "data": {
                "message": str(e)
            }
        }) + "\n"

# Fetch journal impact data when module loads
fetch_journal_impact_data()

@functions_framework.http
def retrieve_full_articles(request):
    # Enable CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
    }

    try:
        request_json = request.get_json()
        if not request_json:
            return jsonify({'error': 'No JSON data received'}), 400, headers

        events_text = request_json.get('events_text')
        if not events_text:
            return jsonify({'error': 'Missing events_text field'}), 400, headers

        # Get methodology content, disease, and num_articles if provided
        methodology_content = request_json.get('methodology_content')
        disease = request_json.get('disease')
        num_articles = request_json.get('num_articles', 15)  # Default to 15 if not provided

        return Response(
            stream_response(events_text, methodology_content, disease, num_articles),
            headers=headers,
            mimetype='text/event-stream'
        )

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({"error": str(e)}), 500, headers

if __name__ == "__main__":
    app = functions_framework.create_app(target="retrieve_full_articles")
    app.run(host="0.0.0.0", port=8080, debug=True)
