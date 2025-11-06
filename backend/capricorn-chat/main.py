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

#!/usr/bin/env python

import functions_framework
from flask import jsonify, Response, stream_with_context
from google import genai
from google.cloud import firestore
import json
import os

# Initialize Firestore client with environment variable
db = firestore.Client(database=os.environ.get('DATABASE_ID', 'capricorn-eu'))

from google.genai import types

# Initialize Gemini client with environment variables
client = genai.Client(
    vertexai=True,
    project=os.environ.get('PROJECT_ID', 'gemini-med-lit-review'),
    location=os.environ.get('LOCATION', 'us-central1'),
)

def get_chat_history(user_id, chat_id):
    """Retrieve chat history from Firestore."""
    chat_ref = db.collection('chats').document(user_id).collection('conversations').document(chat_id)
    chat_doc = chat_ref.get()
    
    if not chat_doc.exists:
        return []
        
    messages = chat_doc.to_dict().get('messages', [])
    return messages

def create_gemini_prompt():
    """Create the expert pediatric oncologist prompt."""
    return """You are engaging in a conversation with a fellow expert clinician about a pediatric oncology case. The conversation history will contain:

1. The initial patient case, including:
   - Detailed case notes
   - Lab results
   - Extracted disease and actionable events

2. A comprehensive literature analysis, including:
   - Full text of relevant research articles
   - Analysis of each article's relevance to the case
   - Detailed breakdown of treatment outcomes, genetic factors, and clinical significance

3. Follow-up questions and discussions about the case and literature

Your role is to:
1. Understand that you're part of an ongoing clinical discussion
2. Ground your responses in the specific context of:
   - The patient's case details
   - The analyzed research articles
   - Previous messages in the conversation

When responding:
1. Draw directly from the articles and analysis in the chat history
2. Reference specific findings, outcomes, or studies mentioned in the conversation
3. Maintain continuity with previous responses
4. Stay focused on the current clinical context
5. Be precise and evidence-based, citing specific details from the provided articles

Remember:
- The user is a fellow expert clinician
- All necessary context is in the conversation history
- Don't make claims without evidence from the provided articles
- Focus on answering the specific question while leveraging the rich context available

The conversation will include full article texts and analysis - use this information to provide detailed, evidence-based responses."""

@functions_framework.http
def chat(request):
    """HTTP Cloud Function for chat interactions."""
    # Set CORS headers for preflight requests
    if request.method == 'OPTIONS':
        headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '3600'
        }
        return ('', 204, headers)

    # Set CORS headers for main requests
    headers = {
        'Access-Control-Allow-Origin': '*'
    }

    request_json = request.get_json(silent=True)
    
    if not request_json:
        return jsonify({'error': 'No JSON data received'}), 400, headers
        
    message = request_json.get('message')
    user_id = request_json.get('userId')
    chat_id = request_json.get('chatId')
    
    if not all([message, user_id, chat_id]):
        return jsonify({'error': 'Missing required fields'}), 400, headers

    try:
        # Get chat history
        chat_history = get_chat_history(user_id, chat_id)
        
        # Create conversation history for Gemini
        conversation = []
        
        # Add system prompt
        conversation.append({
            "role": "user",
            "parts": [create_gemini_prompt()]
        })
        
        # Add chat history - include all messages with raw content
        for msg in chat_history:
            role = "user" if msg.get('role') == 'user' else "model"
            conversation.append({
                "role": role,
                "parts": [msg.get('content')]
            })
        
        # Add current message
        conversation.append({
            "role": "user",
            "parts": [message]
        })


        # Convert conversation to Gemini content format
        contents = []
        for msg in conversation:
            contents.append(
                types.Content(
                    role=msg["role"],
                    parts=[types.Part.from_text(text=msg["parts"][0])]
                )
            )

        # Configure generation settings
        generate_content_config = types.GenerateContentConfig(
            temperature=1,
            top_p=0.95,
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
            ]
        )

        # Generate streaming response
        def generate():
            try:
                response = client.models.generate_content_stream(
                    model="gemini-2.5-pro",
                    contents=contents,
                    config=generate_content_config
                )
                
                for chunk in response:
                    if chunk.text:
                        yield f"data: {json.dumps({'text': chunk.text})}\n\n"
                        
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
            
            yield "data: [DONE]\n\n"

        return Response(
            stream_with_context(generate()),
            headers={
                **headers,
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive'
            }
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500, headers
