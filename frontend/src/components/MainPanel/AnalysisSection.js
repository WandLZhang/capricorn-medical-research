import React from 'react';
import LoadingSpinner from '../LoadingSpinner';

const AnalysisSection = ({
  extractedDisease,
  extractedEvents,
  isRetrieving,
  handleRetrieve,
  isBox3Hovered,
  setIsBox3Hovered,
  isPromptExpanded,
  setIsPromptExpanded,
  promptContent,
  setPromptContent
}) => (
  <div 
    className={`bg-white shadow rounded-lg p-4 mb-4 ${(!extractedDisease || !extractedEvents.length) ? 'opacity-25' : ''}`}
    onMouseEnter={() => extractedDisease && extractedEvents.length && setIsBox3Hovered(true)}
    onMouseLeave={() => setIsBox3Hovered(false)}
  >
    <div className="mb-1 flex justify-between items-center">
      <h2 className="text-xs font-medium text-gray-700">3 - Press Retrieve to analyze relevant papers</h2>
      <div className="flex items-center gap-2">
        <button
          onClick={handleRetrieve}
          disabled={isRetrieving || !extractedDisease || !extractedEvents.length}
          className={`text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
            (isRetrieving || !extractedDisease || !extractedEvents.length) ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isRetrieving ? <LoadingSpinner /> : 'Retrieve'}
        </button>
        <button 
          onClick={() => setIsPromptExpanded(!isPromptExpanded)}
          className="text-gray-500 hover:text-gray-700 focus:outline-none"
        >
          {isPromptExpanded ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          )}
        </button>
      </div>
    </div>
    {isPromptExpanded && (
      <>
        <div className="flex items-start gap-2 mb-2">
          <label className="text-[10px] font-light text-gray-700 w-20 pt-1.5">Analysis instructions</label>
          <textarea
            className="flex-1 p-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs h-[11rem]"
            value={promptContent}
            onChange={(e) => setPromptContent(e.target.value)}
            placeholder="Enter prompt content here..."
          />
        </div>
      </>
    )}
  </div>
);

export default AnalysisSection;
