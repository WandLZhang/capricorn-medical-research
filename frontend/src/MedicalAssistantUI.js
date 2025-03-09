import React, { useState, useEffect, useCallback } from 'react';

// Components
import DisclaimerModal from './components/DisclaimerModal';
import { WrappedExpandableSidebar } from './components/ExpandableSidebar';
import TopBar from './components/TopBar';
import LeftPanel from './components/LeftPanel/LeftPanel';
import MainPanel from './components/MainPanel/MainPanel';
import Footer from './components/Footer';
import LoadingSpinner from './components/LoadingSpinner';

// Hooks
import { useAuth } from './hooks/useAuth';
import useChat from './hooks/useChat';

// API
import { generateSampleCase, extractDisease, extractEvents, retrieveAndAnalyzeArticles, generateFinalAnalysis } from './utils/api';

// Preset Data
import { extractionPrompt, promptContent, presetCaseNotes, presetLabResults } from './data/presetData';

// Utilities
const createMessageId = (type) => `${Date.now()}-${type}-${Math.random().toString(36).substr(2, 9)}`;

const MedicalAssistantUI = () => {
  const [showDisclaimer, setShowDisclaimer] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedDisease, setExtractedDisease] = useState('');
  const [extractedEvents, setExtractedEvents] = useState([]);
  const [isBox2Hovered, setIsBox2Hovered] = useState(false);
  const [isBox3Hovered, setIsBox3Hovered] = useState(false);
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [isProcessingArticles, setIsProcessingArticles] = useState(false);
  const [articles, setArticles] = useState([]);
  const [currentProgress, setCurrentProgress] = useState('');
  const [pmids, setPmids] = useState([]);
  const [totalArticles, setTotalArticles] = useState(0);
  const [currentArticleData, setCurrentArticleData] = useState(null);
  const [isPromptExpanded, setIsPromptExpanded] = useState(true);
  const [numArticles, setNumArticles] = useState(2);
  const [caseNotes, setCaseNotes] = useState('');
  const [labResults, setLabResults] = useState('');
  const [currentPromptContent, setCurrentPromptContent] = useState(promptContent);
  const [isNewChat, setIsNewChat] = useState(true);
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  const [justExtracted, setJustExtracted] = useState(false);
  const [isLoadingChatHistory, setIsLoadingChatHistory] = useState(false);

  const handleSidebarToggle = () => {
    setIsSidebarExpanded(prevState => !prevState);
  };

  console.log('MedicalAssistantUI: setCaseNotes is a function:', typeof setCaseNotes === 'function');

  const { user, firstName, loading, handleLogin, handleLogout, isAuthenticated } = useAuth();
  console.log('[AUTH_MENU_DEBUG] MedicalAssistantUI: auth state:', { user, isAuthenticated, firstName, showUserMenu });

  useEffect(() => {
    console.log('[AUTH_MENU_DEBUG] MedicalAssistantUI: Authentication state changed:', { isAuthenticated, firstName, showUserMenu });
  }, [isAuthenticated, firstName, showUserMenu]);

  const handleToggleUserMenu = () => {
    console.log('[AUTH_MENU_DEBUG] MedicalAssistantUI: Toggling user menu');
    setShowUserMenu(prevState => !prevState);
  };
  
  const {
    chatHistory,
    isLoadingDocs,
    isLoadingAnalysis,
    activeChat,
    message,
    setMessage,
    handleChatSelect: originalHandleChatSelect,
    handleSendMessage,
    initializeNewChat,
    initializeActiveChat,
    hasDocumentMessages
  } = useChat(user);

  const handleChatSelect = (chat) => {
    setIsNewChat(true);
    setCaseNotes('');
    setLabResults('');
    setIsLoadingChatHistory(true);
    originalHandleChatSelect(chat);
  };

  const handleGenerateSampleCase = async () => {
    setIsGeneratingSample(true);
    try {
      const sampleCase = await generateSampleCase();
      setMessage(sampleCase);
    } catch (error) {
      console.error('Error generating sample case:', error);
    }
    setIsGeneratingSample(false);
  };

  // Effect to show disclaimer on initial load
  useEffect(() => {
    const hasSeenDisclaimer = localStorage.getItem('hasSeenDisclaimer');
    if (!hasSeenDisclaimer) {
      setShowDisclaimer(true);
    }
  }, []);

  const handleCloseDisclaimer = () => {
    localStorage.setItem('hasSeenDisclaimer', 'true');
    setShowDisclaimer(false);
  };

  // Effect to handle loading case information when chat history changes
  useEffect(() => {
    if (chatHistory.length > 0) {
      // Find the initial case message
      const initialCaseMessage = chatHistory.find(msg => msg.initialCase);
      if (initialCaseMessage?.initialCase) {
        const { caseNotes: savedCaseNotes, labResults: savedLabResults, extractedDisease, extractedEvents } = initialCaseMessage.initialCase;
        setCaseNotes(savedCaseNotes);
        setLabResults(savedLabResults);
        setExtractedDisease(extractedDisease);
        setExtractedEvents(extractedEvents);
      }
    } else {
      // Clear all content and reset prompt expansion when there's no chat history
      setCaseNotes('');
      setLabResults('');
      setExtractedDisease('');
      setExtractedEvents([]);
      setIsPromptExpanded(true); // Reset prompt expansion when starting new chat
    }
    // Set isLoadingChatHistory back to false after loading is complete
    setIsLoadingChatHistory(false);
  }, [chatHistory]);

  const handleExtract = async () => {
    console.log('[CHAT_DEBUG] Starting extraction process');
    try {
      setIsProcessing(true);
      console.log('[CHAT_DEBUG] User state:', {
        isAuthenticated: !!user,
        userId: user?.uid,
        isAnonymous: user?.isAnonymous
      });
      // Combine case notes and lab results with clear separation
      const combinedNotes = [
        "Case Notes:",
        caseNotes,
        "\nLab Results:",
        labResults
      ].join('\n\n');

      console.log('[CHAT_DEBUG] Extracting disease and events from notes');
      const [disease, events] = await Promise.all([
        extractDisease(combinedNotes),
        extractEvents(combinedNotes, extractionPrompt)
      ]);
      console.log('[CHAT_DEBUG] Extraction results:', { disease, events });
      setExtractedDisease(disease);
      setExtractedEvents(events);
      setIsBox2Hovered(true); // Keep box 2 solid after extraction

      // Initialize active chat with the extracted information
      try {
        console.log('[CHAT_DEBUG] Initializing active chat with extracted data');
        await initializeActiveChat(caseNotes, labResults, disease, events);
        console.log('[CHAT_DEBUG] Chat initialization successful');
        
        // Set justExtracted to true to trigger automatic retrieval
        setJustExtracted(true);
      } catch (error) {
        console.error('[CHAT_DEBUG] Error initializing chat:', error);
      }
    } catch (error) {
      console.error('[CHAT_DEBUG] Extraction error:', error);
      if (error.message.includes('Failed to fetch')) {
        setExtractedDisease('Network error. Please check your connection and try again.');
        setExtractedEvents(['Network error. Please check your connection and try again.']);
      } else {
        setExtractedDisease(error.message || 'Error extracting disease. Please try again.');
        setExtractedEvents([error.message || 'Error extracting events. Please try again.']);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExampleLoad = (exampleCaseNotes, exampleLabResults) => {
    setCaseNotes(exampleCaseNotes);
    setLabResults(exampleLabResults);
  };

  const handleClearAll = useCallback(() => {
    console.log('[CLEAR_DEBUG] MedicalAssistantUI: handleClearAll called');
    console.log('[CLEAR_DEBUG] Before clear - caseNotes:', caseNotes, 'labResults:', labResults);
    setCaseNotes('');
    setLabResults('');
    setExtractedDisease('');
    setExtractedEvents([]);
    setIsBox2Hovered(false);
    setIsBox3Hovered(false);
    setArticles([]);
    setCurrentProgress('');
    setPmids([]);
    setTotalArticles(0);
    setCurrentArticleData(null);
    setIsPromptExpanded(true);
    setIsNewChat(true);
    initializeNewChat();
    console.log('[CLEAR_DEBUG] MedicalAssistantUI: All states reset');
    
    // Force a re-render to ensure the UI updates
    setTimeout(() => {
      console.log('[CLEAR_DEBUG] After timeout - caseNotes:', caseNotes, 'labResults:', labResults);
    }, 0);
  }, [setCaseNotes, setLabResults, setExtractedDisease, setExtractedEvents, initializeNewChat, caseNotes, labResults]);

  const handleRetrieve = async () => {
    const hasDocumentMessages = chatHistory.some(msg => msg.type === 'document');
    console.log('[retrieval_fetch] handleRetrieve called with conditions:', {
      isProcessingArticles,
      extractedDisease,
      extractedEventsLength: extractedEvents.length,
      isLoadingChatHistory,
      hasDocumentMessages
    });
    if (isProcessingArticles || !extractedDisease || !extractedEvents.length || isLoadingChatHistory || hasDocumentMessages) {
      console.log('[retrieval_fetch] Retrieval conditions not met, returning');
      return;
    }
    setIsRetrieving(true);
    setIsProcessingArticles(true);
    setIsPromptExpanded(false);
    setArticles([]);
    setCurrentProgress('');
    setTotalArticles(0);
    setCurrentArticleData(null);

    // Create a local variable to store processed articles
    let processedArticles = [];
    console.log('[retrieval_fetch] Starting article processing. Current processed articles:', processedArticles.length);

    try {
      // Combine case notes and lab results
      const combinedNotes = [
        "Case Notes:",
        caseNotes,
        "\nLab Results:",
        labResults
      ].join('\n\n');

      await retrieveAndAnalyzeArticles(
        extractedDisease,
        extractedEvents,
        promptContent,
        async (data) => {
          if (data.type === 'metadata') {
            if (data.data.status === 'processing') {
              setTotalArticles(data.data.total_articles);
              setCurrentProgress(`Analyzing ${data.data.total_articles} articles...`);
            } else if (data.data.status === 'complete') {
              setCurrentProgress(`Article analysis complete. Generating final analysis...`);
              console.log('All articles processed. Total articles:', processedArticles.length);
              
              // First, send the document message
              const documentsContent = {
                type: 'document',
                content: {
                  articles: processedArticles,
                  currentProgress: currentProgress
                }
              };
              console.log('Sending document message to handleSendMessage:', JSON.stringify(documentsContent, null, 2));
              await handleSendMessage(documentsContent);
              console.log('Document message sent successfully');

              try {
                console.log('Starting final analysis with processed articles:', processedArticles.length);
                // Send the analysis loading state message
                const loadingContent = {
                  type: 'analysis',
                  content: {
                    isLoading: true
                  }
                };
                await handleSendMessage(loadingContent);

                const finalAnalysis = await generateFinalAnalysis(
                  combinedNotes,
                  extractedDisease,
                  extractedEvents,
                  processedArticles
                );
              
                // Send the analysis as a separate message
                const analysisContent = {
                  type: 'analysis',
                  content: finalAnalysis.markdown_content
                };
                
                // Send the analysis message
                console.log('Sending analysis message to handleSendMessage:', JSON.stringify(analysisContent, null, 2));
                await handleSendMessage(analysisContent);
                console.log('Analysis message sent successfully');
                setCurrentProgress('Processing complete.');
              } catch (error) {
                console.error('Error generating final analysis:', error);
                setCurrentProgress('Error generating final analysis. Please try again.');
              }
            }
          }
          else if (data.type === 'pmids') {
            setPmids(data.data.pmids);
            setCurrentProgress('Retrieved PMIDs, creating links...');
          }
          else if (data.type === 'article_analysis') {
            const analysis = data.data.analysis.article_metadata;
            const articleData = {
              pmid: analysis.PMID,
              title: analysis.title,
              points: analysis.overall_points,
              content: data.data.analysis.full_article_text,
              journal_title: analysis.journal_title,
              journal_sjr: analysis.journal_sjr,
              year: analysis.year,
              cancer: analysis.type_of_cancer,
              type: analysis.paper_type,
              events: analysis.actionable_events,
              drugs_tested: analysis.drugs_tested,
              drug_results: analysis.drug_results,
              point_breakdown: analysis.point_breakdown
            };
            
            // Set current article being processed
            setCurrentArticleData(articleData);
            
            // Add to both state and local variable
            setArticles(current => [...current, articleData]);
            processedArticles.push(articleData);
            console.log('Added article to processed articles. Current count:', processedArticles.length);

            const articleNumber = data.data.progress?.article_number || 0;
            const totalArticles = data.data.progress?.total_articles || 0;
            console.log('Progress:', { articleNumber, totalArticles, processedArticlesLength: processedArticles.length });
            
            if (articleNumber > 0 && totalArticles > 0) {
              const progress = (articleNumber / totalArticles) * 100;
              setCurrentProgress(`Processed article ${articleNumber} out of ${totalArticles}`);
            }
          }
        },
        numArticles // Pass numArticles to the API function
      );
    } catch (error) {
      console.error('[RETRIEVE_DEBUG] Error:', error);
      setCurrentProgress('Error retrieving articles. Please try again.');
    } finally {
      setIsRetrieving(false);
      setIsProcessingArticles(false);
      setCurrentArticleData(null);
    }
  };

  useEffect(() => {
    const hasDocumentMessages = chatHistory.some(msg => msg.type === 'document');
    console.log('[retrieval_fetch] Checking conditions for auto-retrieval:', {
      justExtracted,
      extractedDisease,
      extractedEventsLength: extractedEvents.length,
      isRetrieving,
      isProcessingArticles,
      isLoadingChatHistory,
      hasDocumentMessages
    });
    if (justExtracted && extractedDisease && extractedEvents.length > 0 && !isRetrieving && !isProcessingArticles && !isLoadingChatHistory && !hasDocumentMessages) {
      console.log('[retrieval_fetch] Auto-triggering retrieval after extraction');
      handleRetrieve();
      setJustExtracted(false);
    } else {
      console.log('[retrieval_fetch] Conditions not met for auto-retrieval');
    }
  }, [justExtracted, extractedDisease, extractedEvents, isRetrieving, isProcessingArticles, isLoadingChatHistory, chatHistory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <DisclaimerModal isOpen={showDisclaimer} onClose={handleCloseDisclaimer} />
      <TopBar 
        user={user}
        firstName={firstName}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        showUserMenu={showUserMenu}
        setShowUserMenu={handleToggleUserMenu}
        isAuthenticated={isAuthenticated}
      />
      {/* Debug information */}
      <div className="fixed bottom-0 left-0 bg-black text-white p-2 text-xs">
        Debug: isAuthenticated: {isAuthenticated.toString()}, firstName: {firstName}
      </div>

      <div className="flex flex-1 min-h-0 relative w-full">
        <div className="absolute z-10">
          <WrappedExpandableSidebar
            user={user}
            onChatSelect={handleChatSelect}
            activeChat={activeChat}
            initializeNewChat={initializeNewChat}
            setIsNewChat={setIsNewChat}
            isExpanded={isSidebarExpanded}
            onToggle={handleSidebarToggle}
          />
        </div>

        <LeftPanel
          isLoading={!!currentProgress || hasDocumentMessages}
          isRetrieving={isRetrieving}
          handleRetrieve={handleRetrieve}
          isBox3Hovered={isBox3Hovered}
          setIsBox3Hovered={setIsBox3Hovered}
          isPromptExpanded={isPromptExpanded}
          setIsPromptExpanded={setIsPromptExpanded}
          promptContent={currentPromptContent}
          setPromptContent={setCurrentPromptContent}
          currentProgress={currentProgress}
          numArticles={numArticles}
          setNumArticles={setNumArticles}
          hasDocumentMessages={hasDocumentMessages}
        />

        <MainPanel
          extractedDisease={extractedDisease}
          extractedEvents={extractedEvents}
          setExtractedDisease={setExtractedDisease}
          setExtractedEvents={setExtractedEvents}
          articles={articles}
          setArticles={setArticles}
          currentArticleData={currentArticleData}
          chatHistory={chatHistory}
          isGeneratingSample={isGeneratingSample}
          isLoadingDocs={isLoadingDocs}
          isLoadingAnalysis={isLoadingAnalysis}
          message={message}
          setMessage={setMessage}
          handleSendMessage={handleSendMessage}
          handleGenerateSampleCase={handleGenerateSampleCase}
          caseNotes={caseNotes}
          setCaseNotes={setCaseNotes}
          labResults={labResults}
          setLabResults={setLabResults}
          isProcessing={isProcessing}
          handleExtract={handleExtract}
          currentProgress={currentProgress}
          numArticles={numArticles}
          setNumArticles={setNumArticles}
          isNewChat={isNewChat}
          firstName={firstName}
          isRetrieving={isRetrieving}
          handleRetrieve={handleRetrieve}
          isBox3Hovered={isBox3Hovered}
          setIsBox3Hovered={setIsBox3Hovered}
          isPromptExpanded={isPromptExpanded}
          setIsPromptExpanded={setIsPromptExpanded}
          promptContent={currentPromptContent}
          setPromptContent={setCurrentPromptContent}
          handleClearAll={handleClearAll}
          justExtracted={justExtracted}
          setJustExtracted={setJustExtracted}
          isLoadingChatHistory={isLoadingChatHistory}
          isProcessingArticles={isProcessingArticles}
          setIsProcessingArticles={setIsProcessingArticles}
        />
      </div>
      
      <Footer />
    </div>
  );
};

export default MedicalAssistantUI;
