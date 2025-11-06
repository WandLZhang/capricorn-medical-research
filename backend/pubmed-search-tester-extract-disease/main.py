import functions_framework
from flask import jsonify, request
from google import genai
from google.genai import types
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize Vertex AI client
client = genai.Client(
    vertexai=True,
    project=os.environ.get('PROJECT_ID'),
    location=os.environ.get('LOCATION'),
)

PROMPT = """You are an expert pediatric oncologist and chair of the International Leukemia Tumor Board (iLTB). Your role is to analyze patient case notes and identify the primary disease being discussed.

Input: Patient case notes, as provided by a clinician. This will include information on diagnosis, treatment history, and relevant diagnostic findings.

Task:

Disease Extraction:

Carefully analyze the patient case notes.

Identify the primary disease the patient is diagnosed with and/or being treated for. Extract this disease name exactly as it is written in the notes. It should be the initial diagnosis.

Example:

Case Note Input: "A now almost 4-year-old female diagnosed with KMT2A-rearranged AML and CNS2 involvement exhibited refractory disease after NOPHO DBH AML 2012 protocol..."

Output: AML

Case Note Input: "18 y/o boy, diagnosed in November 2021 with T-ALL with CNS1, without any extramedullary disease. Was treated according to ALLTogether protocol..."

Output: T-ALL

Case Note Input: "A 10-year-old patient with relapsed B-cell acute lymphoblastic leukemia (B-ALL) presented..."

Output: B-cell acute lymphoblastic leukemia (B-ALL)

Extract the disease from the provided patient information. Only output the disease name, exactly as it is written in the case notes. Do not include any other text or formatting.

Case notes:
"""

@functions_framework.http
def extract_disease(request):
    # Enable CORS
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    headers = {'Access-Control-Allow-Origin': '*'}

    try:
        request_json = request.get_json()
        if not request_json:
            return jsonify({'error': 'No JSON data received'}), 400, headers

        text = request_json.get('text')
        if not text:
            return jsonify({'error': 'Missing text field'}), 400, headers

        # Create content for Gemini
        contents = [
            types.Content(
                role="user",
                parts=[{"text": PROMPT + text}]
            )
        ]

        # Configure Gemini model
        model = "gemini-2.5-pro"
        tools = [types.Tool(google_search=types.GoogleSearch())]
        generate_content_config = types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
            candidate_count=1,
            max_output_tokens=8192,
            response_modalities=["TEXT"],
            safety_settings=[
                types.SafetySetting(
                    category="HARM_CATEGORY_HATE_SPEECH",
                    threshold="OFF"
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_DANGEROUS_CONTENT",
                    threshold="OFF"
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    threshold="OFF"
                ),
                types.SafetySetting(
                    category="HARM_CATEGORY_HARASSMENT",
                    threshold="OFF"
                )
            ],
            tools=tools,
        )

        # Generate response using Gemini
        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )

        return (response.text, 200, headers)

    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return (jsonify({"error": str(e)}), 500, headers)

if __name__ == "__main__":
    # This is used when running locally only. When deploying to Google Cloud Functions,
    # a webserver will be used to run the app instead
    app = functions_framework.create_app(target="extract_disease")
    port = int(os.environ.get('PORT', 8080))
    app.run(host="0.0.0.0", port=port, debug=True)
