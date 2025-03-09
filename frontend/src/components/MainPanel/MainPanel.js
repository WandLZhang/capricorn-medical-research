import React, { useRef, useEffect, useState, useCallback } from 'react';
import { findLastIndex } from 'lodash';
import ChatContainer from '../Chat/ChatContainer';
import CaseInputSection from '../LeftPanel/CaseInputSection';
import WelcomeText from './WelcomeText';
import { db, auth } from '../../firebase';
import { collection, query, onSnapshot } from 'firebase/firestore';

const fadeAwayClass = "transition-opacity duration-500 ease-in-out";

const CHAT_INPUT_HEIGHT = 60; // Estimated height of ChatInput

const MainPanel = ({
  chatHistory,
  articles,
  currentArticleData,
  isGeneratingSample,
  isLoadingDocs,
  isLoadingAnalysis,
  handleGenerateSampleCase,
  caseNotes,
  setCaseNotes,
  labResults,
  setLabResults,
  isProcessing,
  handleExtract,
  currentProgress,
  numArticles,
  setNumArticles,
  isNewChat,
  firstName,
  extractedDisease,
  extractedEvents,
  setExtractedDisease,
  setExtractedEvents,
  isRetrieving,
  handleRetrieve,
  isBox3Hovered,
  setIsBox3Hovered,
  promptContent,
  setPromptContent,
  message,
  setMessage,
  handleSendMessage,
  handleClearAll,
  justExtracted,
  setJustExtracted,
  isLoadingChatHistory,
  isProcessingArticles,
  setIsProcessingArticles
}) => {
  const [hasAnalysisMessage, setHasAnalysisMessage] = useState(false);
  const [shouldUseScrollEffect, setShouldUseScrollEffect] = useState(false);
  const [showInitialCase, setShowInitialCase] = useState(false);

  const handleExtractionComplete = useCallback(() => {
    setJustExtracted(true);
  }, [setJustExtracted]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const chatRef = collection(db, `chats/${user.uid}/conversations`);
    const q = query(chatRef);
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const hasAnalysis = querySnapshot.docs.some(doc => {
        const messages = doc.data().messages || [];
        return messages.some(message => message.type === 'analysis');
      });
      setHasAnalysisMessage(hasAnalysis);
    });

    return () => unsubscribe();
  }, [auth.currentUser]);
  const [showWelcomeText, setShowWelcomeText] = useState(true);
  const [isBox2Hovered, setIsBox2Hovered] = useState(false);
  const [isExtractionSectionExpanded, setIsExtractionSectionExpanded] = useState(false);
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [showCaseInput, setShowCaseInput] = useState(true);
  const finalAnalysisRef = useRef(null);
  const messageEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const findLastMessageIndex = useCallback((history) => {
    return findLastIndex(history, msg => msg.type === 'message');
  }, []);

  const handleExtractWithWelcomeText = useCallback(() => {
    setShowWelcomeText(false);
    console.log('[FADE_DEBUG] Starting extraction process');
    handleExtract();
  }, [handleExtract]);

  // Update state without scroll effects
  useEffect(() => {
    setShowWelcomeText(chatHistory.length === 0 && isNewChat);
    setShowCaseInput(isNewChat && chatHistory.length === 0);
  }, [chatHistory, isNewChat]);

  // Reset isPromptExpanded when a new extraction occurs
  useEffect(() => {
    if (extractedDisease || extractedEvents.length > 0) {
      setIsPromptExpanded(false);
    }
  }, [extractedDisease, extractedEvents]);

  // Reset case notes and lab results when a new chat is initiated
  useEffect(() => {
    if (isNewChat) {
      setCaseNotes('');
      setLabResults('');
      setShowCaseInput(true);
    }
  }, [isNewChat]);

  useEffect(() => {
    if (isNewChat) {
      setShouldUseScrollEffect(true);
    }
  }, [isNewChat]);

  useEffect(() => {
    if (chatHistory.length > 0 && chatHistory[0].initialCase) {
      setShowInitialCase(true);
    }
  }, [chatHistory]);

  return (
    <main className="flex-1 flex flex-col h-full relative w-full max-w-4xl mx-auto">
      <div className="absolute top-20 left-1/2 transform -translate-x-1/2 z-0">
        <WelcomeText show={showWelcomeText} firstName={firstName} />
      </div>
      <div ref={chatContainerRef} className="flex-1 flex flex-col overflow-auto mt-16">
          <ChatContainer 
            chatInputHeight={CHAT_INPUT_HEIGHT}
            chatHistory={chatHistory}
            isGeneratingSample={isGeneratingSample}
            isLoadingDocs={isLoadingDocs}
            isLoadingAnalysis={isLoadingAnalysis}
            currentProgress={currentProgress}
            currentArticleData={currentArticleData}
            articles={articles}
            finalAnalysisRef={finalAnalysisRef}
            messageEndRef={messageEndRef}
            showArticleResults={true}
            initialArticleResultsExpanded={false}
            totalArticles={numArticles}
            processedArticles={articles.length}
            extractedDisease={extractedDisease}
            extractedEvents={extractedEvents}
            setExtractedDisease={setExtractedDisease}
            setExtractedEvents={setExtractedEvents}
            isRetrieving={isRetrieving}
            handleRetrieve={handleRetrieve}
            isBox3Hovered={isBox3Hovered}
            setIsBox3Hovered={setIsBox3Hovered}
            isPromptExpanded={isPromptExpanded}
            setIsPromptExpanded={setIsPromptExpanded}
            promptContent={promptContent}
            setPromptContent={setPromptContent}
            numArticles={numArticles}
            setNumArticles={setNumArticles}
            shouldUseScrollEffect={shouldUseScrollEffect}
            message={message}
            setMessage={setMessage}
            handleSendMessage={handleSendMessage}
            handleGenerateSampleCase={handleGenerateSampleCase}
            isLoading={isLoadingDocs || isLoadingAnalysis || isGeneratingSample}
            showInitialCase={showInitialCase}
            justExtracted={justExtracted}
            setJustExtracted={setJustExtracted}
            onExtractionComplete={handleExtractionComplete}
            isLoadingChatHistory={isLoadingChatHistory}
            isProcessingArticles={isProcessingArticles}
            setIsProcessingArticles={setIsProcessingArticles}
          />
      </div>
      <div className="relative z-0 mt-auto">
        {/* CaseInputSection */}
        {showCaseInput && (
          <div className={`absolute bottom-0 left-0 right-0 px-4 flex justify-center items-end pb-16 z-50 ${fadeAwayClass} ${showCaseInput ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div className="max-w-[70%] mx-auto">
              <CaseInputSection
                caseNotes={caseNotes}
                setCaseNotes={setCaseNotes}
                labResults={labResults}
                setLabResults={setLabResults}
                isProcessing={isProcessing}
                handleExtract={handleExtractWithWelcomeText}
                handleExampleLoad={(exampleCaseNotes, exampleLabResults) => {
                  setCaseNotes(exampleCaseNotes);
                  setLabResults(exampleLabResults);
                }}
                showCaseInput={showCaseInput}
                handleClearAll={() => {
                  console.log('[CLEAR_DEBUG] MainPanel: handleClearAll called');
                  handleClearAll();
                  setCaseNotes('');
                  setLabResults('');
                  console.log('[CLEAR_DEBUG] MainPanel: After handleClearAll - caseNotes:', caseNotes, 'labResults:', labResults);
                }}
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default MainPanel;
