import React, { useState, useEffect, useRef } from 'react';
import { 
  Trophy, 
  RefreshCw, 
  Volume2, 
  VolumeX, 
  Sparkles, 
  Zap, 
  History, 
  Keyboard, 
  Info, 
  Award, 
  Flame, 
  AlertCircle, 
  ChevronRight, 
  CheckCircle,
  HelpCircle,
  Trash2,
  Clock,
  Gauge
} from 'lucide-react';
import { SENTENCES, RACERS } from './data';
import { Sentence, RacerType, RacerOption, GameStats, GameHistoryEntry } from './types';
import { playKeyPressSound, playErrorSound, playSuccessSound, playCountdownBeep } from './lib/audio';
import { collection, addDoc, serverTimestamp, query, orderBy, limit, getDocs, doc, getDoc, setDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './lib/firebase';

export default function App() {
  // Game state
  const [gameState, setGameState] = useState<'lobby' | 'countdown' | 'playing' | 'finished'>('lobby');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [selectedRacer, setSelectedRacer] = useState<RacerOption>(RACERS[0]); // Default: Horse
  const [sentence, setSentence] = useState<Sentence>(SENTENCES[0]);
  
  // Typing state
  const [inputVal, setInputVal] = useState<string>('');
  const [errorCount, setErrorCount] = useState<number>(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  
  // Countdown state
  const [countdown, setCountdown] = useState<number>(3);
  
  // Timing & stats
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0); // in seconds
  const [currentWpm, setCurrentWpm] = useState<number>(0);
  const [accuracy, setAccuracy] = useState<number>(100);
  
  // Bot opponent state
  const [botProgress, setBotProgress] = useState<number>(0);
  const [botWpm, setBotWpm] = useState<number>(45); // Will vary based on difficulty

  // Local history
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [showHistoryTab, setShowHistoryTab] = useState<boolean>(false);
  const [showGuideModal, setShowGuideModal] = useState<boolean>(false);

  // Leaderboard states
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('typeracer_player_name') || 'Racer';
  });
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [showLeaderboardTab, setShowLeaderboardTab] = useState<boolean>(true);
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);

  // Multiplayer states
  const [playerId] = useState<string>(() => {
    let id = localStorage.getItem('typeracer_player_id');
    if (!id) {
      id = 'player_' + Math.random().toString(36).substring(2, 9);
      localStorage.setItem('typeracer_player_id', id);
    }
    return id;
  });
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isRoomHost, setIsRoomHost] = useState<boolean>(false);
  const [roomPlayers, setRoomPlayers] = useState<{ [id: string]: any }>({});
  const [roomStatus, setRoomStatus] = useState<'waiting' | 'starting' | 'playing' | 'finished' | null>(null);
  const [multiplayerMode, setMultiplayerMode] = useState<boolean>(false);
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [joiningRoom, setJoiningRoom] = useState<boolean>(false);

  // References
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const botTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioInitializedRef = useRef<boolean>(false);

  // Fetch leaderboard helper
  const fetchLeaderboard = async () => {
    try {
      const q = query(
        collection(db, 'typeracer_scores'),
        orderBy('wpm', 'desc'),
        orderBy('accuracy', 'desc'),
        limit(10)
      );
      const querySnapshot = await getDocs(q);
      const scores: any[] = [];
      querySnapshot.forEach((doc) => {
        scores.push({ id: doc.id, ...doc.data() });
      });
      setLeaderboard(scores);
    } catch (error) {
      console.error("Error fetching leaderboard: ", error);
      handleFirestoreError(error, OperationType.LIST, 'typeracer_scores');
    }
  };

  // Load history and leaderboard on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('typeracer_mgl_history');
      if (saved) {
        setHistory(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error reading history', e);
    }
    fetchLeaderboard();
  }, []);

  // Save history helper
  const saveHistoryEntry = (entry: GameHistoryEntry) => {
    const updated = [entry, ...history].slice(0, 50); // Keep last 50 games
    setHistory(updated);
    try {
      localStorage.setItem('typeracer_mgl_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Error saving history', e);
    }
  };

  // Clear history helper
  const clearHistory = () => {
    if (window.confirm('Are you sure you want to clear your typing history?')) {
      setHistory([]);
      try {
        localStorage.removeItem('typeracer_mgl_history');
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Get filtered sentences based on difficulty
  const getFilteredSentences = () => {
    return SENTENCES.filter(s => s.difficulty === difficulty);
  };

  // Initialize a new round
  const handleSelectDifficulty = (diff: 'easy' | 'medium' | 'hard') => {
    setDifficulty(diff);
    // Auto pick a random sentence from that difficulty
    const filtered = SENTENCES.filter(s => s.difficulty === diff);
    const randomSentence = filtered[Math.floor(Math.random() * filtered.length)];
    setSentence(randomSentence);
  };

  const handleSelectRandomSentence = () => {
    const filtered = getFilteredSentences();
    // Exclude current sentence if there are alternatives
    let next = filtered[Math.floor(Math.random() * filtered.length)];
    if (filtered.length > 1) {
      while (next.id === sentence.id) {
        next = filtered[Math.floor(Math.random() * filtered.length)];
      }
    }
    setSentence(next);
  };

  // --- MULTIPLAYER ROOM ACTIONS & EFFECTS ---

  const createMultiplayerRoom = async () => {
    if (!playerName.trim()) {
      alert("Тоглохын өмнө нэрээ оруулна уу!");
      return;
    }
    
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    const roomData = {
      id: code,
      sentenceId: sentence.id,
      sentenceText: sentence.text,
      sentenceAuthor: sentence.author || 'Unknown',
      difficulty: difficulty,
      status: 'waiting',
      createdAt: new Date(),
      players: {
        [playerId]: {
          id: playerId,
          name: playerName.trim(),
          racer: selectedRacer.type,
          progress: 0,
          wpm: 0,
          accuracy: 100,
          isHost: true,
          finished: false
        }
      }
    };

    try {
      const roomRef = doc(db, 'typeracer_rooms', code);
      await setDoc(roomRef, roomData);
      
      setActiveRoomId(code);
      setIsRoomHost(true);
      setMultiplayerMode(true);
      setRoomPlayers(roomData.players);
      setRoomStatus('waiting');
    } catch (error) {
      console.error("Error creating room:", error);
      alert("Өрөө үүсгэхэд алдаа гарлаа: " + error);
    }
  };

  const joinMultiplayerRoom = async (codeToJoin: string) => {
    const code = codeToJoin.trim().toUpperCase();
    if (!code) {
      alert("Өрөөний код оруулна уу!");
      return;
    }
    if (!playerName.trim()) {
      alert("Тоглохын өмнө нэрээ оруулна уу!");
      return;
    }

    setJoiningRoom(true);
    try {
      const roomRef = doc(db, 'typeracer_rooms', code);
      const roomSnap = await getDoc(roomRef);
      
      if (!roomSnap.exists()) {
        alert("Ийм кодтой өрөө олдсонгүй!");
        setJoiningRoom(false);
        return;
      }

      const roomData = roomSnap.data();
      if (roomData.status !== 'waiting') {
        alert("Энэ өрөөний уралдаан аль хэдийн эхэлсэн байна!");
        setJoiningRoom(false);
        return;
      }

      const playerField = `players.${playerId}`;
      await updateDoc(roomRef, {
        [playerField]: {
          id: playerId,
          name: playerName.trim(),
          racer: selectedRacer.type,
          progress: 0,
          wpm: 0,
          accuracy: 100,
          isHost: false,
          finished: false
        }
      });

      setActiveRoomId(code);
      setIsRoomHost(false);
      setMultiplayerMode(true);
      setRoomPlayers({
        ...roomData.players,
        [playerId]: {
          id: playerId,
          name: playerName.trim(),
          racer: selectedRacer.type,
          progress: 0,
          wpm: 0,
          accuracy: 100,
          isHost: false,
          finished: false
        }
      });
      setRoomStatus('waiting');
    } catch (error) {
      console.error("Error joining room:", error);
      alert("Өрөөнд холбогдоход алдаа гарлаа!");
    } finally {
      setJoiningRoom(false);
    }
  };

  const leaveMultiplayerRoom = async () => {
    if (!activeRoomId) return;

    try {
      const roomRef = doc(db, 'typeracer_rooms', activeRoomId);
      
      if (isRoomHost) {
        const updatedPlayers = { ...roomPlayers };
        delete updatedPlayers[playerId];
        
        if (Object.keys(updatedPlayers).length === 0) {
          // If no one left, we can just leave it
        } else {
          const nextHostId = Object.keys(updatedPlayers)[0];
          updatedPlayers[nextHostId].isHost = true;
          await updateDoc(roomRef, {
            players: updatedPlayers
          });
        }
      } else {
        const updatedPlayers = { ...roomPlayers };
        delete updatedPlayers[playerId];
        await updateDoc(roomRef, {
          players: updatedPlayers
        });
      }
    } catch (err) {
      console.error("Error leaving room:", err);
    } finally {
      setActiveRoomId(null);
      setMultiplayerMode(false);
      setIsRoomHost(false);
      setRoomPlayers({});
      setRoomStatus(null);
      setGameState('lobby');
    }
  };

  const startMultiplayerCountdown = async () => {
    if (!activeRoomId || !isRoomHost) return;

    const roomRef = doc(db, 'typeracer_rooms', activeRoomId);
    
    const updatedPlayers = { ...roomPlayers };
    Object.keys(updatedPlayers).forEach(pId => {
      updatedPlayers[pId] = {
        ...updatedPlayers[pId],
        progress: 0,
        wpm: 0,
        accuracy: 100,
        finished: false
      };
    });

    try {
      await updateDoc(roomRef, {
        status: 'starting',
        players: updatedPlayers
      });
    } catch (err) {
      console.error("Error starting countdown:", err);
    }
  };

  // 1. Listen to real-time updates for active room
  useEffect(() => {
    if (!activeRoomId) return;

    const roomRef = doc(db, 'typeracer_rooms', activeRoomId);
    const unsubscribe = onSnapshot(roomRef, (snapshot) => {
      if (!snapshot.exists()) {
        alert("Өрөө олдсонгүй эсвэл устгагдсан байна!");
        setActiveRoomId(null);
        setMultiplayerMode(false);
        setGameState('lobby');
        return;
      }

      const data = snapshot.data();
      setRoomPlayers(data.players || {});
      setRoomStatus(data.status);
      
      if (data.sentenceText && data.sentenceId) {
        setSentence({
          id: data.sentenceId,
          text: data.sentenceText,
          difficulty: data.difficulty || 'medium',
          author: data.sentenceAuthor || 'Unknown'
        });
      }

      // Handle room status changes real-time
      if (data.status === 'starting' && gameState === 'lobby') {
        initAudio();
        setGameState('countdown');
        setCountdown(5);
        setInputVal('');
        setErrorCount(0);
        setElapsedTime(0);
        setCurrentWpm(0);
        setAccuracy(100);

        if (soundEnabled) {
          playCountdownBeep(0.15, false);
        }

        const countdownInterval = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(countdownInterval);
              startGame();
              if (isRoomHost) {
                updateDoc(roomRef, { status: 'playing' }).catch(err => console.error(err));
              }
              return 0;
            }
            if (soundEnabled) {
              playCountdownBeep(0.15, false);
            }
            return prev - 1;
          });
        }, 1000);
      } else if (data.status === 'playing' && gameState === 'countdown') {
        setGameState('playing');
        setStartTime(Date.now());
        setInputVal('');
      } else if (data.status === 'waiting' && (gameState === 'playing' || gameState === 'finished')) {
        setGameState('lobby');
        setInputVal('');
        setElapsedTime(0);
        setCurrentWpm(0);
        setAccuracy(100);
        setErrorCount(0);
      }
    }, (error) => {
      console.error("Room subscription error:", error);
    });

    return () => {
      unsubscribe();
    };
  }, [activeRoomId, gameState, isRoomHost]);

  // 2. Sync player's progress with Firestore on every correct char/WPM/accuracy update
  useEffect(() => {
    if (!multiplayerMode || !activeRoomId || gameState !== 'playing') return;

    const metrics = getTypingMetrics();
    const progress = Math.min(100, Math.round((metrics.correctLength / sentence.text.length) * 100));

    const roomRef = doc(db, 'typeracer_rooms', activeRoomId);
    const playerField = `players.${playerId}`;
    
    updateDoc(roomRef, {
      [`${playerField}.progress`]: progress,
      [`${playerField}.wpm`]: currentWpm,
      [`${playerField}.accuracy`]: accuracy,
      [`${playerField}.finished`]: progress === 100
    }).catch((err) => {
      console.error("Error syncing progress to Firestore:", err);
    });
  }, [inputVal, currentWpm, accuracy, multiplayerMode, activeRoomId, gameState, playerId]);

  // Init Audio contexts upon first interaction
  const initAudio = () => {
    if (!audioInitializedRef.current) {
      // Lazy init AudioContext
      playKeyPressSound(0);
      audioInitializedRef.current = true;
    }
  };

  // Start the countdown
  const startCountdown = () => {
    initAudio();
    setGameState('countdown');
    setCountdown(3);
    setInputVal('');
    setErrorCount(0);
    setElapsedTime(0);
    setCurrentWpm(0);
    setAccuracy(100);
    setBotProgress(0);

    // Determine Bot speed
    let baseBotWpm = 40;
    if (difficulty === 'easy') baseBotWpm = Math.floor(Math.random() * 15) + 25; // 25-40
    else if (difficulty === 'medium') baseBotWpm = Math.floor(Math.random() * 25) + 40; // 40-65
    else if (difficulty === 'hard') baseBotWpm = Math.floor(Math.random() * 35) + 65; // 65-100
    setBotWpm(baseBotWpm);

    if (soundEnabled) {
      playCountdownBeep(0.15, false);
    }

    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          startGame();
          return 0;
        }
        if (soundEnabled) {
          playCountdownBeep(0.15, false);
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Start the actual game typing phase
  const startGame = () => {
    if (soundEnabled) {
      playCountdownBeep(0.2, true);
    }
    setGameState('playing');
    setStartTime(Date.now());
    setInputVal('');

    // Focus input
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }, 50);
  };

  // Stats calculation while typing
  useEffect(() => {
    if (gameState !== 'playing' || !startTime) return;

    timerRef.current = setInterval(() => {
      const durationSeconds = (Date.now() - startTime) / 1000;
      setElapsedTime(durationSeconds);

      // Bot progress update over time
      // Bot WPM represents words/minute. 1 word = 5 characters.
      // progress = (characters typed / total characters) * 100
      const totalChars = sentence.text.length;
      const botCharsPerSecond = (botWpm * 5) / 60;
      const calculatedBotChars = botCharsPerSecond * durationSeconds;
      const calculatedProgress = Math.min(100, (calculatedBotChars / totalChars) * 100);
      setBotProgress(calculatedProgress);

      // Calculate Player WPM: (Correct Chars / 5) / (Minutes)
      // We calculate current correct typing prefix length
      const matchDetails = getTypingMetrics();
      const correctChars = matchDetails.correctLength;
      
      if (durationSeconds > 0.5) {
        const minutes = durationSeconds / 60;
        const wpm = Math.round((correctChars / 5) / minutes);
        setCurrentWpm(wpm);

        // Accuracy: (typed correct / total typed) * 100
        const totalTypedChars = matchDetails.totalTyped;
        if (totalTypedChars > 0) {
          const acc = Math.round(((totalTypedChars - errorCount) / totalTypedChars) * 100);
          setAccuracy(Math.max(0, Math.min(100, acc)));
        }
      }
    }, 100);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameState, startTime, sentence, errorCount, botWpm]);

  // Helper to calculate exact matched substring, wrong typing, and remaining text
  const getTypingMetrics = () => {
    const text = sentence.text;
    let correctLength = 0;
    let hasError = false;
    let errorStartIndex = -1;

    for (let i = 0; i < inputVal.length; i++) {
      if (i >= text.length) break;
      if (!hasError && inputVal[i] === text[i]) {
        correctLength++;
      } else {
        if (!hasError) {
          hasError = true;
          errorStartIndex = i;
        }
      }
    }

    return {
      correctLength,
      hasError,
      errorStartIndex,
      totalTyped: inputVal.length
    };
  };

  const metrics = getTypingMetrics();
  const playerProgress = (metrics.correctLength / sentence.text.length) * 100;

  // Handle typing inputs
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const target = sentence.text;

    // Check backspace or input
    if (value.length > inputVal.length) {
      // User typed a new character
      const latestChar = value[value.length - 1];
      const correspondingTargetChar = target[value.length - 1];

      if (latestChar === correspondingTargetChar) {
        if (soundEnabled) playKeyPressSound(0.12);
      } else {
        setErrorCount(prev => prev + 1);
        if (soundEnabled) playErrorSound(0.15);
      }
    }

    setInputVal(value);

    // Check if finished
    if (value === target) {
      handleGameFinish();
    }
  };

  // Complete game trigger
  const handleGameFinish = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setGameState('finished');

    if (soundEnabled) {
      playSuccessSound(0.25);
    }

    // Final calculations
    const durationSeconds = startTime ? (Date.now() - startTime) / 1000 : 1;
    const finalWpm = Math.max(1, Math.round((sentence.text.length / 5) / (durationSeconds / 60)));
    const totalTyped = sentence.text.length + errorCount;
    const finalAccuracy = Math.round(((totalTyped - errorCount) / totalTyped) * 100);

    // Save history entry
    const entry: GameHistoryEntry = {
      id: Math.random().toString(36).substring(2, 9),
      sentenceText: sentence.text,
      wpm: finalWpm,
      accuracy: finalAccuracy,
      errors: errorCount,
      date: new Date().toLocaleDateString('mn-MN', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      racer: selectedRacer.type
    };
    saveHistoryEntry(entry);

    // Save score to Firestore "typeracer_scores" collection
    setIsSubmittingScore(true);
    addDoc(collection(db, 'typeracer_scores'), {
      name: playerName.trim() || 'Anonymous Racer',
      wpm: finalWpm,
      accuracy: finalAccuracy,
      racer: selectedRacer.type,
      timestamp: serverTimestamp()
    }).then(() => {
      setIsSubmittingScore(false);
      fetchLeaderboard(); // Refresh global top 10 leaderboard
    }).catch((err) => {
      console.error("Error saving score to Firestore:", err);
      setIsSubmittingScore(false);
      handleFirestoreError(err, OperationType.CREATE, 'typeracer_scores');
    });
  };

  // Escape to cancel / return to setup
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === 'playing' || gameState === 'countdown') {
          if (timerRef.current) clearInterval(timerRef.current);
          setGameState('lobby');
        }
      }
      if (e.key === 'Enter' && gameState === 'finished') {
        startCountdown();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, sentence, selectedRacer]);

  // Dynamic feedback phrase
  const getFeedbackMessage = () => {
    if (currentWpm >= 80) return 'Stellar speed! You typed with lightning-fast pace!';
    if (currentWpm >= 60) return 'Perfect speed! You are a professional typist.';
    if (currentWpm >= 45) return 'Excellent! Your typing is incredibly consistent and swift.';
    if (currentWpm >= 30) return 'Good speed! Daily practice will make you even faster.';
    return 'Keep going! Practice makes perfect, try again to beat your record.';
  };

  return (
    <div id="game-root" className="min-h-screen bg-[#020617] text-white flex flex-col items-center justify-start p-4 md:p-8 relative overflow-x-hidden select-none">
      
      {/* Decorative Mesh Background - Beautiful Neon Blurs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[45%] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[45%] bg-purple-600/10 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute top-[40%] left-[30%] w-[350px] h-[350px] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none"></div>

      {/* Outer App Frame */}
      <div className="w-full max-w-5xl z-10 flex flex-col gap-6 md:gap-8">
        
        {/* Navigation & Header */}
        <header className="flex flex-col sm:flex-row justify-between items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-6 shadow-lg gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="font-extrabold text-2xl tracking-tighter">TR</span>
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-white/90 uppercase flex items-center gap-2">
                Typeracer <span className="text-indigo-400 font-mono text-sm tracking-wider px-2 py-0.5 bg-indigo-500/20 border border-indigo-500/30 rounded">EN 🇬🇧</span>
              </h1>
              <p className="text-xs text-white/50 hidden md:block">Type fast and accurate to reach the finish line!</p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            {/* Audio Toggle */}
            <button 
              id="audio-toggle-btn"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`p-3 rounded-xl border transition-all duration-200 flex items-center justify-center ${
                soundEnabled 
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20' 
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10'
              }`}
              title={soundEnabled ? 'Mute' : 'Unmute'}
            >
              {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
            </button>

            {/* How to play Guide */}
            <button 
              id="guide-btn"
              onClick={() => setShowGuideModal(true)}
              className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
            >
              <Info className="w-4 h-4 text-indigo-400" />
              <span>How to Play</span>
            </button>

            {/* External Typeracer Link Tab */}
            <a 
              id="external-typeracer-btn"
              href="https://typeracer-seven-beta.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-indigo-500/10 hover:border-indigo-500/30 hover:text-indigo-300 text-white/80 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2"
            >
              <span>⌨️ Typeracer</span>
            </a>

            {/* Leaderboard Toggle */}
            <button 
              id="leaderboard-btn"
              onClick={() => {
                setShowLeaderboardTab(!showLeaderboardTab);
                if (showHistoryTab) setShowHistoryTab(false);
              }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border flex items-center gap-2 ${
                showLeaderboardTab 
                  ? 'bg-amber-500/20 border-amber-500/30 text-amber-300' 
                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
              }`}
            >
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Leaderboard (TOP 10)</span>
            </button>

            {/* History Toggle */}
            <button 
              id="history-btn"
              onClick={() => {
                setShowHistoryTab(!showHistoryTab);
                if (showLeaderboardTab) setShowLeaderboardTab(false);
              }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border flex items-center gap-2 ${
                showHistoryTab 
                  ? 'bg-purple-500/20 border-purple-500/30 text-purple-300' 
                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
              }`}
            >
              <History className="w-4 h-4 text-purple-400" />
              <span>My History ({history.length})</span>
            </button>
          </div>
        </header>

        {/* Local History Sidebar/Drawer */}
        {showHistoryTab && (
          <section id="history-section" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl animate-fadeIn transition-all">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold">Your Typing History</h3>
              </div>
              <div className="flex gap-2">
                <button 
                  id="clear-history-btn"
                  onClick={clearHistory}
                  disabled={history.length === 0}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear History</span>
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-sm">
                No races played yet. Start your first race above! 🏁
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[250px] overflow-y-auto pr-2 custom-scrollbar">
                {history.map((item, idx) => (
                  <div key={item.id} className="bg-black/30 border border-white/5 rounded-xl p-3.5 flex flex-col justify-between hover:border-indigo-500/30 transition-all">
                    <div className="flex justify-between items-start gap-2 mb-2">
                      <span className="text-xs text-white/40">{item.date}</span>
                      <span className="px-2 py-0.5 bg-white/5 rounded-full text-[10px] font-mono border border-white/10 uppercase">
                        {RACERS.find(r => r.type === item.racer)?.emoji} {RACERS.find(r => r.type === item.racer)?.name}
                      </span>
                    </div>
                    <p className="text-xs text-white/70 line-clamp-2 italic mb-3 font-mono">
                      "{item.sentenceText}"
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-auto">
                      <div className="text-center">
                        <span className="text-[10px] text-white/40 block">Speed</span>
                        <span className="font-mono font-bold text-sm text-indigo-400">{item.wpm} WPM</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-white/40 block">Accuracy</span>
                        <span className="font-mono font-bold text-sm text-emerald-400">{item.accuracy}%</span>
                      </div>
                      <div className="text-center">
                        <span className="text-[10px] text-white/40 block">Errors</span>
                        <span className="font-mono font-bold text-sm text-rose-400">{item.errors} chars</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Leaderboard Section */}
        {showLeaderboardTab && (
          <section id="leaderboard-section" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl animate-fadeIn transition-all">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <h3 className="text-lg font-bold">Global TOP 10 Leaderboard</h3>
              </div>
              <div>
                <button
                  onClick={fetchLeaderboard}
                  className="px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5 animate-spin-slow" />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div className="text-center py-8 text-white/40 text-sm">
                No high scores recorded yet. Be the first to secure a spot! 🏆
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/5 text-white/40 text-xs uppercase tracking-wider">
                      <th className="py-3 px-4 font-semibold w-16">Rank</th>
                      <th className="py-3 px-4 font-semibold">Racer Name</th>
                      <th className="py-3 px-4 font-semibold text-center">Vehicle</th>
                      <th className="py-3 px-4 font-semibold text-right">Speed (WPM)</th>
                      <th className="py-3 px-4 font-semibold text-right">Accuracy</th>
                      <th className="py-3 px-4 font-semibold text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((score, index) => {
                      const racerInfo = RACERS.find(r => r.type === score.racer);
                      const rankColor = index === 0 
                        ? 'text-amber-400 bg-amber-400/10 border-amber-400/30 font-black shadow-[0_0_10px_rgba(251,191,36,0.1)]' 
                        : index === 1 
                        ? 'text-slate-300 bg-slate-300/10 border-slate-300/30 font-bold' 
                        : index === 2 
                        ? 'text-amber-600 bg-amber-600/10 border-amber-600/30 font-bold' 
                        : 'text-white/60 bg-white/5 border-white/5 font-mono';

                      return (
                        <tr 
                          key={score.id} 
                          className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-xs border ${rankColor}`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-white/90">
                            {score.name}
                          </td>
                          <td className="py-3 px-4 text-center text-sm">
                            {racerInfo ? `${racerInfo.emoji} ${racerInfo.name}` : '🏎️'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-indigo-400">
                            {score.wpm} <span className="text-[10px] text-white/30 font-sans">WPM</span>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                            {score.accuracy}%
                          </td>
                          <td className="py-3 px-4 text-right text-xs text-white/40">
                            {score.timestamp?.seconds 
                              ? new Date(score.timestamp.seconds * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })
                              : 'Just now'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* LOBBY / SETUP STATE */}
        {gameState === 'lobby' && (
          activeRoomId ? (
            // --- MULTIPLAYER ROOM WAITING LOBBY ---
            <div id="room-lobby-container" className="max-w-4xl mx-auto w-full bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 animate-fadeIn text-left">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-white/10 pb-4 gap-4">
                <div>
                  <span className="text-xs uppercase tracking-wider text-indigo-400 font-bold font-mono">Multiplayer Room</span>
                  <h2 className="text-2xl md:text-3xl font-black text-white/90 flex items-center gap-2 mt-1">
                    <span>🎮 Хамтран тоглох өрөө</span>
                  </h2>
                </div>
                
                {/* Room Code Showcase */}
                <div className="bg-black/40 border border-white/10 px-4 py-2.5 rounded-xl flex items-center gap-3">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-white/40 block">Өрөөний код</span>
                    <span className="text-xl font-mono font-black text-indigo-300 tracking-wider select-all">{activeRoomId}</span>
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(activeRoomId);
                      alert("Өрөөний код хуулагдлаа! Найзууддаа илгээгээрэй.");
                    }}
                    className="p-2 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-semibold border border-indigo-500/10 hover:border-indigo-500/20 transition-all"
                  >
                    Хуулах
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* 1. Players list */}
                <div className="md:col-span-2 bg-black/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex justify-between items-center pb-2 border-b border-white/5">
                    <span className="text-sm font-bold text-white/80">Холбогдсон тоглогчид ({Object.keys(roomPlayers).length})</span>
                    <span className="text-xs text-indigo-400 font-mono animate-pulse">● Бодит цагт холбоотой</span>
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    {Object.values(roomPlayers).map((player: any) => {
                      const rIcon = RACERS.find(r => r.type === player.racer) || RACERS[0];
                      return (
                        <div 
                          key={player.id} 
                          className={`flex items-center justify-between p-3.5 rounded-xl border transition-all ${
                            player.id === playerId 
                              ? 'bg-indigo-500/10 border-indigo-500/30 shadow-[0_0_15px_rgba(99,102,241,0.05)]' 
                              : 'bg-white/5 border-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-3xl filter drop-shadow">{rIcon.emoji}</span>
                            <div>
                              <div className="font-bold text-sm text-white/95 flex items-center gap-1.5">
                                <span>{player.name}</span>
                                {player.id === playerId && (
                                  <span className="bg-indigo-500 text-white font-bold text-[8px] px-1.5 py-0.5 rounded uppercase tracking-wider">Чи</span>
                                )}
                              </div>
                              <span className="text-xs text-white/40">Унаа: {rIcon.name}</span>
                            </div>
                          </div>
                          
                          <div>
                            {player.isHost ? (
                              <span className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold px-2.5 py-1 rounded-lg">Эзэн 👑</span>
                            ) : (
                              <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold px-2.5 py-1 rounded-lg">Бэлэн ✅</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Room Configuration info & Actions */}
                <div className="bg-black/20 border border-white/5 rounded-2xl p-5 flex flex-col gap-5">
                  <div className="pb-2 border-b border-white/5">
                    <span className="text-sm font-bold text-white/80">Уралдааны Төлөв</span>
                  </div>

                  <div className="flex flex-col gap-3 text-xs text-white/70">
                    <div className="flex justify-between">
                      <span className="text-white/40">Хүндрэл:</span>
                      <span className="font-bold text-indigo-300 uppercase tracking-wide">{difficulty}</span>
                    </div>
                    <div className="flex flex-col gap-1 bg-black/40 p-3 rounded-xl border border-white/5">
                      <span className="text-white/40 block mb-1 font-semibold">Бичих ишлэл:</span>
                      <span className="italic text-white/85 line-clamp-3">"{sentence.text}"</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 mt-auto pt-4 border-t border-white/5">
                    {isRoomHost ? (
                      <button
                        onClick={startMultiplayerCountdown}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold py-3.5 px-5 rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-xs flex items-center justify-center gap-2 group active:scale-[0.98]"
                      >
                        <span>Уралдааныг Эхлүүлэх 🏁</span>
                      </button>
                    ) : (
                      <div className="w-full bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3 text-center text-xs font-semibold text-indigo-300 animate-pulse">
                        Өрөөний эзэн уралдааныг эхлүүлэхийг хүлээж байна...
                      </div>
                    )}

                    <button
                      onClick={leaveMultiplayerRoom}
                      className="w-full bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 text-rose-300 font-bold py-3 px-5 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                    >
                      Өрөөнөөс Гарах
                    </button>
                  </div>
                </div>

              </div>
            </div>
          ) : (
            // --- SINGLE PLAYER LOBBY ---
            <div id="lobby-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
              
              {/* Racer Select & Difficulty Configuration */}
              <div className="lg:col-span-2 flex flex-col gap-6">

                {/* Racer Nickname Card */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-3 text-left">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <span className="text-xl">👤</span>
                    <h2 className="font-extrabold text-lg tracking-tight">Racer Name</h2>
                  </div>
                  <p className="text-xs text-white/60">Enter your name to register your speed score on the live global leaderboard!</p>
                  <input
                    type="text"
                    placeholder="Enter your nickname (e.g., TypingKing)..."
                    maxLength={25}
                    value={playerName}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPlayerName(val);
                      localStorage.setItem('typeracer_player_name', val);
                    }}
                    className="w-full bg-black/40 border border-white/15 focus:border-indigo-500/80 rounded-xl px-4 py-3 text-white placeholder-white/35 font-semibold text-sm focus:outline-none transition-colors"
                  />
                </div>
                
                {/* Option 1: Racer Vehicle Selection */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4 text-left">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <Flame className="w-5 h-5 text-indigo-400" />
                    <h2 className="font-extrabold text-lg tracking-tight">1. Choose Your Racer</h2>
                  </div>
                  <p className="text-sm text-white/60">Select your favorite avatar to ride and race on the track.</p>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-2">
                    {RACERS.map((r) => {
                      const isSelected = selectedRacer.type === r.type;
                      return (
                        <button
                          key={r.type}
                          id={`racer-select-${r.type}`}
                          onClick={() => {
                            setSelectedRacer(r);
                            if (soundEnabled) playKeyPressSound(0.15);
                          }}
                          className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-all duration-300 gap-2 relative overflow-hidden group ${
                            isSelected 
                              ? 'bg-gradient-to-b from-indigo-500/20 to-purple-500/10 border-indigo-500/60 shadow-[0_0_20px_rgba(99,102,241,0.2)]' 
                              : 'bg-black/20 border-white/5 hover:border-white/20 hover:bg-white/5'
                          }`}
                        >
                          <span className={`text-4xl filter drop-shadow-md transform transition-transform group-hover:scale-110 ${isSelected ? 'scale-110' : ''}`}>
                            {r.emoji}
                          </span>
                          <span className="text-xs font-semibold text-white/90">{r.name}</span>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-indigo-400 rounded-full animate-ping"></div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Option 2: Choose Difficulty & Get Random Sentence */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-5 text-left">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <Keyboard className="w-5 h-5 text-indigo-400" />
                      <h2 className="font-extrabold text-lg tracking-tight">2. Select Difficulty</h2>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {(['easy', 'medium', 'hard'] as const).map((level) => {
                      const label = level === 'easy' ? 'Easy' : level === 'medium' ? 'Medium' : 'Hard';
                      const colorClass = level === 'easy' ? 'hover:bg-emerald-500/10 hover:border-emerald-500/30' : level === 'medium' ? 'hover:bg-amber-500/10 hover:border-amber-500/30' : 'hover:bg-rose-500/10 hover:border-rose-500/30';
                      const activeClass = level === 'easy' ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-300' : level === 'medium' ? 'bg-amber-500/20 border-amber-500/60 text-amber-300' : 'bg-rose-500/20 border-rose-500/60 text-rose-300';
                      return (
                        <button
                          key={level}
                          id={`diff-btn-${level}`}
                          onClick={() => {
                            handleSelectDifficulty(level);
                            if (soundEnabled) playKeyPressSound(0.15);
                          }}
                          className={`flex-1 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                            difficulty === level ? activeClass : `bg-black/20 border-white/5 ${colorClass} text-white/60`
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>

                  {/* Selected Sentence Preview */}
                  <div className="bg-black/40 border border-white/5 rounded-xl p-4 flex flex-col gap-3 relative group">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Selected Quote</span>
                      <button
                        id="randomize-sentence-btn"
                        onClick={handleSelectRandomSentence}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 transition-colors font-medium"
                        title="Select another sentence"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Change Sentence</span>
                      </button>
                    </div>

                    <p className="text-base md:text-lg font-mono leading-relaxed text-white/95 italic">
                      "{sentence.text}"
                    </p>

                    <div className="flex flex-col sm:flex-row justify-between pt-2 border-t border-white/5 text-xs text-white/40 gap-1">
                      <span>Author: <strong className="text-white/60">{sentence.author || 'Unknown'}</strong></span>
                      <span>Length: <strong className="text-white/60 font-mono">{sentence.text.length} chars</strong></span>
                    </div>
                  </div>

                  {/* START GAME BUTTON */}
                  <button
                    id="start-race-btn"
                    onClick={startCountdown}
                    className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold py-4 px-6 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 text-lg flex items-center justify-center gap-3 group active:scale-[0.98]"
                  >
                    <Sparkles className="w-6 h-6 text-amber-300 animate-pulse group-hover:scale-110 transition-transform" />
                    <span>START TYPING RACE 🏁</span>
                  </button>

                </div>

              </div>

              {/* Side Information: Stats dashboard & Leaderboard */}
              <div className="flex flex-col gap-6 text-left">
                
                {/* Leaderboard/Best stats */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <Award className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-extrabold text-lg tracking-tight">Your Personal Bests</h3>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                      <span className="text-[10px] text-white/40 uppercase block tracking-wider mb-1">Highest WPM</span>
                      <span className="text-3xl font-mono font-bold text-indigo-400">
                        {history.length > 0 ? Math.max(...history.map(h => h.wpm)) : '0'}
                      </span>
                    </div>
                    <div className="bg-black/30 rounded-xl p-3 border border-white/5 text-center">
                      <span className="text-[10px] text-white/40 uppercase block tracking-wider mb-1">Avg Accuracy</span>
                      <span className="text-3xl font-mono font-bold text-emerald-400">
                        {history.length > 0 
                          ? Math.round(history.reduce((acc, h) => acc + h.accuracy, 0) / history.length) 
                          : '100'}%
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-white/50 flex flex-col gap-2 bg-indigo-500/5 p-3 rounded-xl border border-indigo-500/10">
                    <div className="flex gap-2 items-start">
                      <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                      <span><strong>WPM (Words Per Minute)</strong> measures your typing speed where 1 word is standardized as 5 characters.</span>
                    </div>
                  </div>
                </div>

                {/* MULTIPLAYER CONFIGURATION CARD */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-4 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-full blur-xl pointer-events-none group-hover:bg-indigo-500/15 transition-all"></div>
                  
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <span className="text-xl">🎮</span>
                    <h3 className="font-extrabold text-lg tracking-tight">Хамт Тоглох (Multiplayer)</h3>
                  </div>
                  <p className="text-xs text-white/60">Найзуудтайгаа бодит цагт уралдаж хэн нь хамгийн хурдан бичдэгийг үзээрэй!</p>
                  
                  {/* Join room box */}
                  <div className="flex flex-col gap-2 bg-black/20 p-4 rounded-xl border border-white/5">
                    <span className="text-[10px] uppercase font-bold text-white/40">Кодоор өрөөнд орох</span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="КОД"
                        maxLength={8}
                        value={roomCodeInput}
                        onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                        className="flex-1 bg-black/40 border border-white/10 focus:border-indigo-500/80 rounded-lg px-2 py-1.5 text-center font-mono font-bold text-white tracking-widest text-xs focus:outline-none"
                      />
                      <button
                        onClick={() => joinMultiplayerRoom(roomCodeInput)}
                        disabled={joiningRoom}
                        className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-400 disabled:bg-indigo-850 text-white rounded-lg text-xs font-bold transition-all shrink-0"
                      >
                        {joiningRoom ? '...' : 'Орох'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 py-0.5">
                    <div className="h-px bg-white/10 flex-1"></div>
                    <span className="text-[9px] uppercase font-bold text-white/30">Эсвэл</span>
                    <div className="h-px bg-white/10 flex-1"></div>
                  </div>

                  {/* Create Room button */}
                  <button
                    onClick={createMultiplayerRoom}
                    className="w-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/20 font-bold py-2 px-4 rounded-xl transition-all text-xs flex items-center justify-center gap-2"
                  >
                    Шинэ өрөө үүсгэх 🔑
                  </button>
                </div>

                {/* Tips */}
                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl flex flex-col gap-3">
                  <h4 className="font-bold text-sm tracking-wide text-white/80">💡 Speed Typing Tips:</h4>
                  <ul className="text-xs text-white/60 space-y-2 list-disc pl-4">
                    <li>Keep your eyes on the screen, not your hands.</li>
                    <li>Properly rest all 10 fingers on the home row keys.</li>
                    <li>Maintain good posture and relaxed breathing to boost speed.</li>
                    <li>Use <kbd className="bg-white/10 px-1 py-0.5 rounded text-[10px]">Backspace</kbd> to fix errors and move forward.</li>
                  </ul>
                </div>

              </div>

            </div>
          )
        )}

        {/* COUNTDOWN TIMER STATE */}
        {gameState === 'countdown' && (
          <div id="countdown-container" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-12 shadow-2xl flex flex-col items-center justify-center min-h-[400px] text-center animate-pulse">
            <p className="text-indigo-400 text-sm md:text-base font-bold tracking-widest uppercase mb-4 font-mono">Race Starts In</p>
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center border-4 border-white/20 shadow-2xl shadow-indigo-500/30 mb-6">
              <span className="text-7xl font-mono font-black">{countdown}</span>
            </div>
            <p className="text-white/60 text-base max-w-sm">Place your fingers on the keyboard and get ready!</p>
            <p className="text-xs text-indigo-300/80 italic mt-6">Selected Racer: {selectedRacer.emoji} {selectedRacer.name}</p>
          </div>
        )}

        {/* GAME RACING / PLAYING OR FINISHED STATES */}
        {(gameState === 'playing' || gameState === 'finished') && (
          <div className="flex flex-col gap-6 md:gap-8">
            
            {/* 1. Header with live/final stats */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 md:p-6 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 font-bold font-mono">
                  {difficulty === 'easy' ? 'E' : difficulty === 'medium' ? 'M' : 'H'}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white/80">English Speed Typing Race</h2>
                  <p className="text-xs text-white/40">Source: {sentence.author || 'Inspirational Quote'}</p>
                </div>
              </div>

              <div className="flex items-center gap-8 md:gap-12 w-full sm:w-auto justify-around">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Хурд (WPM)</p>
                  <p className="text-2xl md:text-3xl font-mono font-bold text-indigo-400">
                    {currentWpm}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Алдаа</p>
                  <p className="text-2xl md:text-3xl font-mono font-bold text-rose-400">
                    {errorCount}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Нарийвчлал</p>
                  <p className="text-2xl md:text-3xl font-mono font-bold text-amber-400">
                    {accuracy}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-widest text-white/40 mb-1">Хугацаа</p>
                  <p className="text-2xl md:text-3xl font-mono font-bold text-emerald-400">
                    {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toFixed(0).padStart(2, '0')}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. PROGRESS RACING TRACK (The visual race!) */}
            <div className="relative bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6 md:p-8 h-auto flex flex-col gap-6 shadow-inner overflow-hidden">
              
              {/* Background styling elements */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white/5 pointer-events-none"></div>

              {multiplayerMode ? (
                // MULTIPLAYER LANES
                <div className="flex flex-col gap-5 w-full">
                  {Object.values(roomPlayers).map((player: any) => {
                    const rIcon = RACERS.find(r => r.type === player.racer) || RACERS[0];
                    const isMe = player.id === playerId;
                    return (
                      <div key={player.id} className="relative h-12 flex items-center border-b border-white/5 pb-2 last:border-0 last:pb-0">
                        <div className="absolute left-0 right-12 h-0.5 bg-dashed-line bg-white/10 top-1/2 -translate-y-1/2"></div>
                        <div className="absolute left-0 h-3 w-0.5 bg-indigo-500/30 top-1/2 -translate-y-1/2"></div>
                        <div className="absolute right-12 h-3 w-0.5 bg-emerald-500/30 top-1/2 -translate-y-1/2"></div>
                        
                        {/* Racer vehicle */}
                        <div 
                          className="absolute flex flex-col items-center transition-all duration-300 ease-out z-10"
                          style={{ left: `calc(${player.progress || 0}% * 0.82)` }}
                        >
                          <span className={`text-3xl md:text-4xl drop-shadow-[0_0_8px_rgba(99,102,241,0.4)] ${player.finished ? '' : 'animate-bounce'}`} style={{ animationDuration: '0.9s' }}>
                            {rIcon.emoji}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider border shadow-sm ${
                            isMe 
                              ? 'bg-indigo-500 text-white border-indigo-400' 
                              : 'bg-white/10 text-white/80 border-white/10'
                          }`}>
                            {player.name} {player.wpm > 0 ? `(${player.wpm} WPM)` : ''}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                // SINGLE PLAYER LANES (Player + Bot!)
                <div className="flex flex-col gap-6 w-full">
                  {/* Player Lane */}
                  <div className="relative h-12 flex items-center">
                    <div className="absolute left-0 right-12 h-0.5 bg-dashed-line bg-white/10 top-1/2 -translate-y-1/2"></div>
                    <div className="absolute left-0 h-3 w-0.5 bg-indigo-500/30 top-1/2 -translate-y-1/2"></div>
                    <div className="absolute right-12 h-3 w-0.5 bg-emerald-500/30 top-1/2 -translate-y-1/2"></div>
                    
                    <div 
                      className="absolute flex flex-col items-center transition-all duration-300 ease-out z-10"
                      style={{ left: `calc(${playerProgress}% * 0.82)` }}
                    >
                      <span className="text-3xl md:text-4xl drop-shadow-[0_0_8px_rgba(99,102,241,0.4)] animate-bounce" style={{ animationDuration: '0.8s' }}>
                        {selectedRacer.emoji}
                      </span>
                      <span className="px-2 py-0.5 bg-indigo-500 text-white rounded-full text-[8px] font-bold uppercase tracking-wider border border-indigo-400/50 shadow-sm">
                        {playerName} (Чи)
                      </span>
                    </div>
                  </div>

                  {/* Bot Lane */}
                  <div className="relative h-12 flex items-center border-t border-white/5 pt-2">
                    <div className="absolute left-0 right-12 h-0.5 bg-dashed-line bg-white/10 top-1/2 -translate-y-1/2"></div>
                    <div className="absolute left-0 h-3 w-0.5 bg-purple-500/30 top-1/2 -translate-y-1/2"></div>
                    <div className="absolute right-12 h-3 w-0.5 bg-emerald-500/30 top-1/2 -translate-y-1/2"></div>
                    
                    <div 
                      className="absolute flex flex-col items-center transition-all duration-300 ease-out z-10"
                      style={{ left: `calc(${botProgress}% * 0.82)` }}
                    >
                      <span className="text-3xl md:text-4xl drop-shadow-[0_0_8px_rgba(168,85,247,0.4)] animate-bounce" style={{ animationDuration: '1.2s' }}>
                        🤖
                      </span>
                      <span className="px-2 py-0.5 bg-purple-600 text-white rounded-full text-[8px] font-bold uppercase tracking-wider border border-purple-400/50 shadow-sm">
                        Робот өрсөлдөгч ({botWpm} WPM)
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Finish Flag display */}
              <div className="absolute right-2 top-2 text-[8px] font-bold text-emerald-400 uppercase tracking-wider font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                Бариа 🏁
              </div>

            </div>

            {/* 3. TYPING DISPLAY PANEL */}
            {gameState === 'playing' && (
              <div id="typing-panel" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-2xl animate-fadeIn">
                
                {/* Text render engine with visual letter feedback */}
                <div className="text-xl md:text-2xl leading-relaxed font-mono tracking-wide min-h-[240px] h-auto bg-black/30 p-6 md:p-8 rounded-2xl border border-white/5 select-none">
                  {sentence.text.split('').map((char, index) => {
                    let colorClass = 'text-white/40'; // Untyped
                    let bgClass = '';
                    let isCurrent = index === inputVal.length;

                    if (index < inputVal.length) {
                      // Character has been typed
                      if (inputVal[index] === sentence.text[index]) {
                        // Correctly typed
                        colorClass = 'text-emerald-400 font-semibold';
                      } else {
                        // Error typed
                        colorClass = 'text-rose-400 font-bold line-through';
                        bgClass = 'bg-rose-500/20 px-0.5 rounded';
                      }
                    }

                    return (
                      <span 
                        key={index} 
                        className={`${colorClass} ${bgClass} transition-colors duration-150 relative ${
                          isCurrent ? 'underline decoration-indigo-400 decoration-4 underline-offset-4 font-bold text-white' : ''
                        }`}
                      >
                        {char}
                        {isCurrent && (
                          <span className="absolute -bottom-1 left-0 right-0 h-1 bg-indigo-400 animate-pulse"></span>
                        )}
                      </span>
                    );
                  })}
                </div>

                {/* Input box & restart triggers */}
                <div className="flex flex-col gap-3 relative mt-2">
                  <div className="flex justify-between items-center px-1">
                    <span className="text-xs uppercase font-bold text-indigo-400 tracking-wider">
                      Type this text: 
                    </span>
                    <span className="text-[10px] text-white/40">
                      Keyboard: <strong className="text-white/60">English (US/UK)</strong>
                    </span>
                  </div>

                  <div className="relative flex flex-col sm:flex-row gap-4 items-center">
                    <div className="relative w-full">
                      <input 
                        ref={inputRef}
                        type="text" 
                        value={inputVal}
                        onChange={handleInputChange}
                        autoCapitalize="off"
                        autoComplete="off"
                        autoCorrect="off"
                        spellCheck={false}
                        placeholder="Type the sentence here..."
                        className={`w-full bg-black/40 border-2 rounded-2xl px-6 py-5 text-lg md:text-xl font-mono focus:outline-none transition-all pr-12 ${
                          metrics.hasError 
                            ? 'border-rose-500/60 shadow-[0_0_20px_rgba(239,68,68,0.15)] focus:border-rose-500' 
                            : 'border-indigo-500/30 focus:border-indigo-500/80 shadow-[0_0_30px_rgba(99,102,241,0.1)]'
                        }`}
                      />
                      {metrics.hasError && (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-rose-400 flex items-center gap-1">
                          <AlertCircle className="w-5 h-5 animate-bounce" />
                        </div>
                      )}
                    </div>

                    <button 
                      id="reset-midgame-btn"
                      onClick={() => {
                        if (window.confirm('Are you sure you want to restart the race?')) {
                          startCountdown();
                        }
                      }}
                      className="w-full sm:w-auto px-6 py-4.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-white/20 font-bold rounded-2xl transition-all flex items-center justify-center gap-2"
                      title="Restart from beginning"
                    >
                      <RefreshCw className="w-5 h-5 text-indigo-400" />
                      <span className="sm:hidden lg:inline">Restart</span>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] text-white/30 pt-2 border-t border-white/5">
                  <span>Characters: <strong className="text-white/40">{inputVal.length} / {sentence.text.length}</strong></span>
                  <div className="flex gap-4">
                    <span><kbd className="bg-white/5 px-1 py-0.5 rounded">Esc</kbd> Back</span>
                  </div>
                </div>

              </div>
            )}

            {/* 4. SUMMARY / VICTORY FINISHED PANEL */}
            {gameState === 'finished' && (
              <div id="finish-panel" className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10 flex flex-col gap-8 shadow-2xl text-center relative overflow-hidden">
                
                {/* Decorative glowing finish light */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-emerald-400 to-indigo-500 blur-sm"></div>

                <div>
                  <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mb-4 animate-bounce">
                    <Trophy className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white/90">
                    Race Completed! 🎉
                  </h2>
                  <p className="text-sm text-indigo-300 font-medium max-w-lg mx-auto mt-2 italic font-mono">
                    "{getFeedbackMessage()}"
                  </p>
                </div>

                {/* Final stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto w-full">
                  
                  <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center">
                    <Gauge className="w-6 h-6 text-indigo-400 mb-1" />
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Speed (WPM)</span>
                    <span className="text-2xl md:text-3xl font-mono font-black text-indigo-300 mt-1">{currentWpm}</span>
                    <span className="text-[9px] text-white/30 mt-0.5">Words per min</span>
                  </div>

                  <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center">
                    <AlertCircle className="w-6 h-6 text-rose-400 mb-1" />
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Errors</span>
                    <span className="text-2xl md:text-3xl font-mono font-black text-rose-300 mt-1">{errorCount}</span>
                    <span className="text-[9px] text-white/30 mt-0.5">Wrong characters</span>
                  </div>

                  <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center">
                    <CheckCircle className="w-6 h-6 text-emerald-400 mb-1" />
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Accuracy</span>
                    <span className="text-2xl md:text-3xl font-mono font-black text-emerald-300 mt-1">{accuracy}%</span>
                    <span className="text-[9px] text-white/30 mt-0.5">Correct keystrokes</span>
                  </div>

                  <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex flex-col justify-center items-center">
                    <Clock className="w-6 h-6 text-amber-400 mb-1" />
                    <span className="text-[10px] text-white/40 uppercase tracking-wider">Total Time</span>
                    <span className="text-2xl md:text-3xl font-mono font-black text-amber-300 mt-1">
                      {Math.floor(elapsedTime / 60)}:{(elapsedTime % 60).toFixed(0).padStart(2, '0')}
                    </span>
                    <span className="text-[9px] text-white/30 mt-0.5">min : sec</span>
                  </div>

                </div>

                {/* Speed rank badge */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4 max-w-xl mx-auto w-full flex items-center justify-between">
                  <div className="text-left">
                    <span className="text-[10px] uppercase text-white/40 font-bold block">Racer Title:</span>
                    <span className="text-sm font-bold text-white/95">
                      {currentWpm >= 80 ? (
                        <span className="text-indigo-400">🚀 Space Speedmaster</span>
                      ) : currentWpm >= 60 ? (
                        <span className="text-emerald-400">🏎️ Formula Elite</span>
                      ) : currentWpm >= 45 ? (
                        <span className="text-amber-400">🐎 Steppe Champion</span>
                      ) : currentWpm >= 30 ? (
                        <span className="text-sky-400">🚲 Swift Rider</span>
                      ) : (
                        <span className="text-white/60">👣 Determined Learner</span>
                      )}
                    </span>
                  </div>
                  <span className="text-xs font-mono px-3 py-1 bg-black/40 border border-white/10 rounded-lg text-white/60">
                    Accuracy: {accuracy}%
                  </span>
                </div>

                {/* Score saving status indicator */}
                <div className="text-xs max-w-xl mx-auto w-full text-center">
                  {isSubmittingScore ? (
                    <span className="text-amber-400 font-medium flex items-center justify-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Saving score to Global Leaderboard...
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold flex items-center justify-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                      Saved successfully as "{playerName || 'Anonymous Racer'}"!
                    </span>
                  )}
                </div>

                {/* Multiplayer Room Results Leaderboard */}
                {multiplayerMode && (
                  <div className="bg-black/30 border border-white/10 rounded-2xl p-5 max-w-xl mx-auto w-full flex flex-col gap-3 text-left animate-fadeIn">
                    <div className="flex justify-between items-center pb-2 border-b border-white/5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-400 font-mono">Уралдааны Үр Дүн</span>
                      <span className="text-[10px] text-white/40">Бодит цагийн дүн</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {Object.values(roomPlayers)
                        .sort((a: any, b: any) => (b.wpm || 0) - (a.wpm || 0))
                        .map((player: any, idx) => {
                          const rIcon = RACERS.find(r => r.type === player.racer) || RACERS[0];
                          return (
                            <div key={player.id} className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono font-bold text-white/40 w-4">{idx + 1}.</span>
                                <span className="text-2xl">{rIcon.emoji}</span>
                                <span className="text-sm font-bold text-white/90">
                                  {player.name} {player.id === playerId ? '(Чи)' : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-bold text-indigo-400 font-mono">{player.wpm || 0} WPM</span>
                                <span className="text-[11px] text-emerald-400 font-mono">{player.accuracy || 100}%</span>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Restart actions */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center max-w-md mx-auto w-full mt-4">
                  {multiplayerMode ? (
                    isRoomHost ? (
                      <>
                        <button
                          onClick={async () => {
                            const roomRef = doc(db, 'typeracer_rooms', activeRoomId!);
                            await updateDoc(roomRef, { status: 'waiting' });
                          }}
                          className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold py-4 px-6 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 text-base flex items-center justify-center gap-2"
                        >
                          <RefreshCw className="w-5 h-5 text-white animate-spin-slow" />
                          <span>Дахин уралдах (Лобби)</span>
                        </button>
                        <button
                          onClick={leaveMultiplayerRoom}
                          className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white font-bold py-4 px-6 rounded-2xl transition-all text-base"
                        >
                          Өрөөнөөс гарах
                        </button>
                      </>
                    ) : (
                      <div className="w-full text-center flex flex-col gap-3">
                        <div className="text-xs font-semibold text-indigo-300 animate-pulse bg-indigo-500/5 border border-indigo-500/10 rounded-xl p-3">
                          Өрөөний эзэн шинэ уралдаан эхлүүлэхийг хүлээж байна...
                        </div>
                        <button
                          onClick={leaveMultiplayerRoom}
                          className="w-full bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 hover:border-rose-500/30 text-rose-300 font-bold py-3.5 px-6 rounded-2xl transition-all text-xs"
                        >
                          Өрөөнөөс гарах
                        </button>
                      </div>
                    )
                  ) : (
                    <>
                      <button
                        id="play-again-btn"
                        onClick={startCountdown}
                        className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-extrabold py-4 px-6 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 text-base flex items-center justify-center gap-2 group"
                      >
                        <RefreshCw className="w-5 h-5 text-white animate-spin-slow" />
                        <span>Play Again (Enter)</span>
                      </button>

                      <button
                        id="lobby-back-btn"
                        onClick={() => setGameState('lobby')}
                        className="w-full bg-white/5 hover:bg-white/10 text-white/90 border border-white/10 hover:border-white/20 font-bold py-4 px-6 rounded-2xl transition-all text-base flex items-center justify-center gap-2"
                      >
                        <span>Back to Setup (Esc)</span>
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>

              </div>
            )}

          </div>
        )}

        {/* Footer shortcuts & copyright */}
        <footer className="flex flex-col sm:flex-row justify-between items-center text-white/30 text-[11px] font-medium gap-3 px-2 pt-4 border-t border-white/5">
          <div className="flex gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10 text-[9px]">Esc</kbd> 
              <span>Menu / Back</span>
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="bg-white/10 px-1.5 py-0.5 rounded border border-white/10 text-[9px]">Enter</kbd> 
              <span>Restart Race</span>
            </span>
          </div>
          <div>
            <span>TypeRacer English © 2026. Improve your speed and accuracy.</span>
          </div>
        </footer>

      </div>

      {/* Guide Help Modal */}
      {showGuideModal && (
        <div id="guide-modal" className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h3 className="text-lg font-extrabold text-indigo-400 mb-3 flex items-center gap-2">
              <HelpCircle className="w-5 h-5" />
              <span>How to Play</span>
            </h3>
            
            <div className="text-sm text-white/80 space-y-3 font-mono">
              <p>
                1. <strong>Preparation:</strong> Select your preferred racer avatar and a difficulty level that fits your skill.
              </p>
              <p>
                2. <strong>Starting:</strong> Click the "START TYPING RACE" button to trigger a 3-second countdown. Once it sounds, type the quote as fast and accurately as possible.
              </p>
              <p>
                3. <strong>Input Feedback:</strong> Correct characters turn <span className="text-emerald-400 font-bold">green</span>, while wrong ones turn <span className="text-rose-400 font-bold">red</span>. Use <kbd className="bg-white/10 px-1 py-0.5 rounded">Backspace</kbd> to edit.
              </p>
              <p>
                4. <strong>Finish:</strong> Completing the sentence calculates your exact WPM and accuracy, updating your record history.
              </p>
            </div>

            <button 
              id="close-guide-btn"
              onClick={() => setShowGuideModal(false)}
              className="mt-6 w-full bg-indigo-500 hover:bg-indigo-400 text-white font-bold py-2.5 px-4 rounded-xl transition-all"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
