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

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { redactSensitiveInfo } from '../../utils/api';
import LoadingSpinner from '../LoadingSpinner';
import { presetCaseNotes, presetLabResults } from '../../data/presetData';
import { Mic, MicOff, AlertTriangle, ArrowRight } from 'lucide-react';
import useDebounce from '../../hooks/useDebounce';

// Define the SpeechRecognition interface
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const CaseInputSection = ({
  caseNotes,
  setCaseNotes,
  labResults,
  setLabResults,
  isProcessing,
  handleExtract,
  handleExampleLoad,
  showCaseInput,
  handleClearAll,
  numArticles,
  setNumArticles
}) => {
  const [isRedacting, setIsRedacting] = useState(false);
  const [showLabResults, setShowLabResults] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [hasInput, setHasInput] = useState(false);
  const [error, setError] = useState(null);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [focusedInput, setFocusedInput] = useState('caseNotes');
  const [localCaseNotes, setLocalCaseNotes] = useState('');
  const [localLabResults, setLocalLabResults] = useState('');
  const caseNotesRef = useRef(null);
  const labResultsRef = useRef(null);
  const recognitionRef = useRef(null);
  const debouncedCaseNotes = useDebounce(localCaseNotes, 500);
  const debouncedLabResults = useDebounce(localLabResults, 500);

  useEffect(() => {
    const hasInputNow = localCaseNotes.trim().length > 0;
    setHasInput(hasInputNow);
  }, [localCaseNotes]);

  useEffect(() => {
    setLocalCaseNotes(caseNotes || '');
    setLocalLabResults(labResults || '');
  }, [caseNotes, labResults]);

  useEffect(() => {
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        let finalTranscript = '';
        let currentInterimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            currentInterimTranscript += event.results[i][0].transcript;
          }
        }

        if (finalTranscript) {
          console.log('SPEECH_DEBUG: Microphone finished transcribing');
          if (focusedInput === 'caseNotes') {
            setCaseNotes(prevNotes => {
              const newNotes = (prevNotes.trim() === '' ? finalTranscript : prevNotes + ' ' + finalTranscript).trim();
              console.log('SPEECH_DEBUG: Text added to case notes');
              setLocalCaseNotes(newNotes);
              return newNotes;
            });
          } else {
            setLabResults(prevResults => {
              const newResults = (prevResults.trim() === '' ? finalTranscript : prevResults + ' ' + finalTranscript).trim();
              console.log('SPEECH_DEBUG: Text added to lab results');
              setLocalLabResults(newResults);
              return newResults;
            });
          }
          setHasInput(true);
        }
        setInterimTranscript(currentInterimTranscript);
      };

      recognitionRef.current.onerror = (event) => {
        setError(`Speech recognition error: ${event.error}`);
        setIsListening(false);
        console.log('SPEECH_DEBUG: Speech recognition error occurred');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        setInterimTranscript('');
        console.log('SPEECH_DEBUG: Speech recognition ended');
        console.log('SPEECH_DEBUG: Starting redaction');
        handleRedaction(localCaseNotes, setCaseNotes);
      };
    } else {
      setError('Speech Recognition API is not supported in this browser.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const handleRedaction = useCallback(
    async (text, setter) => {
      if (!text.trim()) return;
      
      try {
        setIsRedacting(true);
        console.log('SPEECH_DEBUG: Sending text for redaction:', text);
        const redactedText = await redactSensitiveInfo(text);
        console.log('SPEECH_DEBUG: Received redacted text:', redactedText);
        setter(redactedText);
        console.log('SPEECH_DEBUG: Redaction completed and set');
      } catch (error) {
        console.error('SPEECH_DEBUG: Redaction failed:', error);
      } finally {
        setIsRedacting(false);
      }
    },
    []
  );

  useEffect(() => {
    handleRedaction(debouncedCaseNotes, setCaseNotes);
  }, [debouncedCaseNotes, handleRedaction, setCaseNotes]);

  useEffect(() => {
    handleRedaction(debouncedLabResults, setLabResults);
  }, [debouncedLabResults, handleRedaction, setLabResults]);

  const handleCaseNotesChange = (e) => {
    const newText = e.target.value;
    setLocalCaseNotes(newText);
    setCaseNotes(newText);
    setHasInput(newText.trim().length > 0);
    adjustTextareaHeight(caseNotesRef.current);
  };

  const handleCaseNotesFocus = () => {
    setFocusedInput('caseNotes');
  };

  const handleCaseNotesBlur = () => {
    if (!labResultsRef.current || !labResultsRef.current.contains(document.activeElement)) {
      setFocusedInput(null);
    }
  };

  const handleButtonClick = useCallback(() => {
    if (!recognitionRef.current) return;

    if (!isListening) {
      if (!hasInput) {
        setError(null); // Clear any previous errors
        try {
          recognitionRef.current.start();
          setIsListening(true);
        } catch (error) {
          setError(`Failed to start recognition: ${error.message}`);
          setIsListening(false);
        }
      } else if (!isProcessing) {
        handleExtract();
      }
    } else {
      recognitionRef.current.stop();
      setIsListening(false);
      console.log('SPEECH_DEBUG: Manually stopped recording');
    }
  }, [isListening, hasInput, isProcessing, handleExtract]);

  const handleLabResultsChange = (e) => {
    const newText = e.target.value;
    setLocalLabResults(newText);
    setLabResults(newText);
    adjustTextareaHeight(labResultsRef.current);
  };

  const handleLabResultsFocus = () => {
    setFocusedInput('labResults');
  };

  const handleLabResultsBlur = () => {
    if (!caseNotesRef.current || !caseNotesRef.current.contains(document.activeElement)) {
      setFocusedInput(null);
    }
  };

  const adjustTextareaHeight = (textarea) => {
    if (!textarea) return;
    
    textarea.style.height = 'auto';
    const newHeight = textarea.scrollHeight + 4;
    const maxHeight = window.innerHeight * 0.35;
    
    if (newHeight <= maxHeight) {
      textarea.style.height = newHeight + 'px';
    } else {
      textarea.style.height = maxHeight + 'px';
      textarea.style.overflowY = 'auto';
    }
  };

  useEffect(() => {
    if (caseNotesRef.current) {
      adjustTextareaHeight(caseNotesRef.current);
    }
  }, [localCaseNotes]);

  useEffect(() => {
    if (labResultsRef.current && showLabResults) {
      adjustTextareaHeight(labResultsRef.current);
    }
  }, [localLabResults, showLabResults]);

  const handleClear = useCallback(() => {
    console.log('[CLEAR_DEBUG] CaseInputSection: handleClear called');
    console.log('[CLEAR_DEBUG] Before clear - localCaseNotes:', localCaseNotes, 'localLabResults:', localLabResults);
    handleClearAll();
    setLocalCaseNotes('');
    setLocalLabResults('');
    setCaseNotes('');
    setLabResults('');
    setShowLabResults(false);
    setHasInput(false);
    setInterimTranscript('');
    setFocusedInput('caseNotes');
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      console.log('[CLEAR_DEBUG] CaseInputSection: Speech recognition stopped');
    }
    if (caseNotesRef.current) {
      caseNotesRef.current.style.height = 'auto';
    }
    if (labResultsRef.current) {
      labResultsRef.current.style.height = 'auto';
    }
    console.log('[CLEAR_DEBUG] CaseInputSection: Textarea heights reset');
    
    // Force a re-render to ensure the UI updates
    setTimeout(() => {
      console.log('[CLEAR_DEBUG] After timeout - localCaseNotes:', localCaseNotes, 'localLabResults:', localLabResults);
    }, 0);
  }, [isListening, handleClearAll, setCaseNotes, setLabResults]);

  // Add this new effect to log state changes
  useEffect(() => {
    console.log('[CLEAR_DEBUG] State changed - localCaseNotes:', localCaseNotes, 'localLabResults:', localLabResults, 'hasInput:', hasInput);
  }, [localCaseNotes, localLabResults, hasInput]);

  const handleExampleClick = () => {
    setLocalCaseNotes(presetCaseNotes);
    setLocalLabResults(presetLabResults);
    setCaseNotes(presetCaseNotes);
    setLabResults(presetLabResults);
    setShowLabResults(true);
    setHasInput(true);
    
    setTimeout(() => {
      adjustTextareaHeight(caseNotesRef.current);
      adjustTextareaHeight(labResultsRef.current);
    }, 0);
    
    if (typeof handleExampleLoad === 'function') {
      handleExampleLoad(presetCaseNotes, presetLabResults);
    }
  };

  const toggleLabResults = () => {
    setShowLabResults(prev => !prev);
  };

  if (!showCaseInput) {
    return null;
  }

  return (
    <div className="bg-white border border-gray-200 rounded-3xl p-6 pb-5 w-full min-w-[600px] flex flex-col transition-all duration-300 ease-in-out max-h-[75vh] overflow-hidden shadow-sm hover:shadow-md relative mb-8 px-8">
      {isRedacting && (
        <div className="absolute top-0 left-0 right-0 bg-blue-100 bg-opacity-90 text-blue-700 px-2 py-1 text-xs z-10">
          <div className="flex items-center">
            <svg className="animate-spin h-3 w-3 mr-1 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Redacting sensitive information...
          </div>
        </div>
      )}
      <div className="flex-grow overflow-y-auto flex flex-col">
        <div className="relative">
          <textarea
            ref={caseNotesRef}
            className="w-full bg-transparent text-gray-800 text-sm placeholder-gray-400 border-none focus:outline-none resize-none mb-2 overflow-y-auto"
            value={localCaseNotes + (focusedInput === 'caseNotes' && isListening ? ' ' + interimTranscript : '')}
            onChange={handleCaseNotesChange}
            onFocus={handleCaseNotesFocus}
            onBlur={handleCaseNotesBlur}
            placeholder="Please input your case notes"
            style={{ minHeight: '3em', maxHeight: '35vh' }}
          />
        </div>
        
        {showLabResults && (
          <div className="mt-2 pt-4 border-t border-gray-100">
            <textarea
              ref={labResultsRef}
              className="w-full bg-transparent text-gray-800 text-sm placeholder-gray-400 border-none focus:outline-none resize-none overflow-y-auto"
              value={localLabResults + (focusedInput === 'labResults' && isListening ? ' ' + interimTranscript : '')}
              onChange={handleLabResultsChange}
              onFocus={handleLabResultsFocus}
              onBlur={handleLabResultsBlur}
              placeholder="Enter lab results here"
              style={{ minHeight: '3em', maxHeight: '35vh' }}
            />
          </div>
        )}
      </div>
      
      <div className="flex items-center justify-between mt-2 flex-shrink-0 relative h-10">
        <div className="flex items-center">
          <button
            onClick={toggleLabResults}
            className="flex items-center text-blue-600 hover:text-blue-700 text-sm font-medium transition-colors duration-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={showLabResults ? "M20 12H4" : "M12 4v16m8-8H4"} />
            </svg>
            {showLabResults ? 'Hide lab results' : 'Add lab results'}
          </button>
          <div className="flex items-center ml-12">
            <label htmlFor="numArticles" className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors duration-200 mr-2"># of articles:</label>
            <input
              id="numArticles"
              type="number"
              min="1"
              max="50"
              value={numArticles}
              onChange={(e) => {
                const value = Math.min(50, Math.max(1, parseInt(e.target.value) || 15));
                setNumArticles(value);
              }}
              className="w-16 p-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={handleExampleClick}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors duration-200"
          >
            Example
          </button>
          <button
            onClick={handleClear}
            className="text-gray-600 hover:text-gray-800 text-sm font-medium transition-colors duration-200"
          >
            Clear
          </button>
          <button
            onClick={handleButtonClick}
            disabled={isProcessing}
            className={`flex items-center justify-center rounded-full w-10 h-10 focus:outline-none focus:ring-2 transition-all duration-300 shadow-sm ${
              isProcessing ? "bg-gray-400 text-white focus:ring-gray-300" :
              isListening ? "bg-red-500 hover:bg-red-600 text-white focus:ring-red-300 animate-pulse" :
              hasInput ? "bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-300" :
              "bg-gray-700 hover:bg-gray-800 text-white focus:ring-gray-400"
            }`}
          >
            {isProcessing ? (
              <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin"></div>
            ) : isListening ? (
              <MicOff className="w-5 h-5" />
            ) : hasInput ? (
              <ArrowRight className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
      {error && (
        <div className="text-red-500 flex items-center mt-2">
          <AlertTriangle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
    </div>
  );
};

export default CaseInputSection;
