'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Crown, Clock, Check, Sparkles } from 'lucide-react';
import { useGameStore } from '@/store/gameStore';
import { getSocket } from '@/lib/socket';
import type { RPSChoice } from '@/types/game';
import { getAvatarUrlFromSeed } from '@/components/game/AvatarCustomizer';
import { useGameTimer } from '@/components/game';
import { useAudio } from '@/hooks/useAudio';

// RPS Icons and colors
const RPS_CONFIG: Record<RPSChoice, { emoji: string; name: string; color: string; beats: RPSChoice }> = {
  rock: { emoji: '✊', name: 'Stein', color: 'from-stone-500 to-stone-600', beats: 'scissors' },
  paper: { emoji: '✋', name: 'Papier', color: 'from-blue-400 to-blue-500', beats: 'rock' },
  scissors: { emoji: '✌️', name: 'Schere', color: 'from-red-400 to-red-500', beats: 'paper' },
};

interface DuelPlayer {
  id: string;
  name: string;
  avatarSeed: string;
}

interface RoundResult {
  round: number;
  player1Choice: RPSChoice;
  player2Choice: RPSChoice;
  roundWinner: 'player1' | 'player2' | 'tie';
}

interface CategorySelectedData {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
}

export function RPSDuelScreen() {
  const room = useGameStore((s) => s.room);
  const playerId = useGameStore((s) => s.playerId);
  const { playSfx } = useAudio();
  
  const [phase, setPhase] = useState<'selecting' | 'choosing' | 'revealing' | 'result' | 'picking' | 'selected'>('selecting');
  const [player1, setPlayer1] = useState<DuelPlayer | null>(null);
  const [player2, setPlayer2] = useState<DuelPlayer | null>(null);
  const [player1Wins, setPlayer1Wins] = useState(0);
  const [player2Wins, setPlayer2Wins] = useState(0);
  const [currentRound, setCurrentRound] = useState(1);
  const [myChoice, setMyChoice] = useState<RPSChoice | null>(null);
  const [opponentChosen, setOpponentChosen] = useState(false);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [lastRoundResult, setLastRoundResult] = useState<RoundResult | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [revealedCategory, setRevealedCategory] = useState<CategorySelectedData | null>(null);

  // Synchronized timer using server time (for choosing/picking phases)
  const { remaining: timeLeft } = useGameTimer(
    (phase === 'choosing' || phase === 'picking') ? room?.timerEnd ?? null : null,
    room?.serverTime
  );

  const categories = room?.votingCategories || [];
  
  // Get players from room state as fallback
  const rpsDuel = room?.rpsDuel;
  const player1FromRoom = rpsDuel?.player1Id 
    ? room?.players.find(p => p.id === rpsDuel.player1Id)
    : null;
  const player2FromRoom = rpsDuel?.player2Id 
    ? room?.players.find(p => p.id === rpsDuel.player2Id)
    : null;

  const effectivePlayer1 = player1 || (player1FromRoom ? {
    id: player1FromRoom.id,
    name: player1FromRoom.name,
    avatarSeed: player1FromRoom.avatarSeed,
  } : null);
  const effectivePlayer2 = player2 || (player2FromRoom ? {
    id: player2FromRoom.id,
    name: player2FromRoom.name,
    avatarSeed: player2FromRoom.avatarSeed,
  } : null);

  const isParticipant = playerId === effectivePlayer1?.id || playerId === effectivePlayer2?.id;
  const isPlayer1 = playerId === effectivePlayer1?.id;
  const isWinner = playerId === winnerId;

  // Sync state with room data
  useEffect(() => {
    if (!player1 && player1FromRoom) {
      setPlayer1({
        id: player1FromRoom.id,
        name: player1FromRoom.name,
        avatarSeed: player1FromRoom.avatarSeed,
      });
    }
    if (!player2 && player2FromRoom) {
      setPlayer2({
        id: player2FromRoom.id,
        name: player2FromRoom.name,
        avatarSeed: player2FromRoom.avatarSeed,
      });
    }
  }, [player1, player2, player1FromRoom, player2FromRoom]);

  // Socket event listeners
  useEffect(() => {
    const socket = getSocket();

    const handleDuelStart = (data: { player1: DuelPlayer; player2: DuelPlayer }) => {
      console.log('✊✌️✋ RPS Duel start:', data);
      setPlayer1(data.player1);
      setPlayer2(data.player2);
      setPhase('selecting');
      setPlayer1Wins(0);
      setPlayer2Wins(0);
      setCurrentRound(1);
      setRoundResults([]);
      setLastRoundResult(null);
      setWinnerId(null);
      setSelectedCategory(null);
      setRevealedCategory(null);
    };

    const handleRoundStart = (data: { round: number }) => {
      console.log('✊✌️✋ Round start:', data.round);
      setCurrentRound(data.round);
      setPhase('choosing');
      setMyChoice(null);
      setOpponentChosen(false);
      setLastRoundResult(null);
    };

    const handleChoiceMade = (data: { playerId: string }) => {
      console.log('✊✌️✋ Choice made by:', data.playerId);
      if (data.playerId !== playerId) {
        setOpponentChosen(true);
      }
    };

    const handleRoundResult = (data: {
      round: number;
      player1Choice: RPSChoice;
      player2Choice: RPSChoice;
      roundWinner: 'player1' | 'player2' | 'tie';
      player1Wins: number;
      player2Wins: number;
    }) => {
      console.log('✊✌️✋ Round result:', data);
      setPhase('revealing');
      setPlayer1Wins(data.player1Wins);
      setPlayer2Wins(data.player2Wins);
      
      const result: RoundResult = {
        round: data.round,
        player1Choice: data.player1Choice,
        player2Choice: data.player2Choice,
        roundWinner: data.roundWinner,
      };
      setLastRoundResult(result);
      setRoundResults(prev => [...prev, result]);
    };

    const handleDuelWinner = (data: { winnerId: string; winnerName: string; player1Wins: number; player2Wins: number }) => {
      console.log('✊✌️✋ Duel winner:', data);
      setWinnerId(data.winnerId);
      setPlayer1Wins(data.player1Wins);
      setPlayer2Wins(data.player2Wins);
      setPhase('result');
    };

    const handleDuelPick = () => {
      console.log('✊✌️✋ Winner can now pick');
      setPhase('picking');
    };

    const handleCategorySelected = (data: CategorySelectedData) => {
      console.log('✊✌️✋ Category selected:', data);
      setRevealedCategory(data);
      setPhase('selected');
    };

    socket.on('rps_duel_start', handleDuelStart);
    socket.on('rps_round_start', handleRoundStart);
    socket.on('rps_choice_made', handleChoiceMade);
    socket.on('rps_round_result', handleRoundResult);
    socket.on('rps_duel_winner', handleDuelWinner);
    socket.on('rps_duel_pick', handleDuelPick);
    socket.on('category_selected', handleCategorySelected);

    return () => {
      socket.off('rps_duel_start', handleDuelStart);
      socket.off('rps_round_start', handleRoundStart);
      socket.off('rps_choice_made', handleChoiceMade);
      socket.off('rps_round_result', handleRoundResult);
      socket.off('rps_duel_winner', handleDuelWinner);
      socket.off('rps_duel_pick', handleDuelPick);
      socket.off('category_selected', handleCategorySelected);
    };
  }, [playerId]);

  const handleChoice = (choice: RPSChoice) => {
    if (!isParticipant || myChoice || phase !== 'choosing') return;
    
    setMyChoice(choice);
    playSfx('buzz');
    const socket = getSocket();
    socket.emit('rps_choice', { roomCode: room?.code, playerId, choice });
  };

  const handlePick = (categoryId: string) => {
    if (!isWinner || selectedCategory || phase !== 'picking') return;
    
    setSelectedCategory(categoryId);
    const socket = getSocket();
    socket.emit('rps_duel_pick', { roomCode: room?.code, playerId, categoryId });
  };

  // Show category reveal
  if (revealedCategory) {
    const winner = winnerId === effectivePlayer1?.id ? effectivePlayer1 : effectivePlayer2;
    return (
      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="min-h-screen flex flex-col items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-center"
        >
          <motion.div className="text-5xl mb-4">✊✌️✋</motion.div>
          
          <div className="flex items-center justify-center gap-3 mb-6">
            <img
              src={getAvatarUrlFromSeed(winner?.avatarSeed || '', 'superHappy')}
              alt=""
              className="w-10 h-10 rounded-full bg-muted border-2 border-red-500"
            />
            <span className="text-lg">{winner?.name} hat gewählt:</span>
          </div>

          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, type: 'spring' }}
            className="glass px-12 py-8 rounded-3xl border-2 border-red-500/50"
          >
            <span className="text-6xl block mb-4">{revealedCategory.categoryIcon}</span>
            <h2 className="text-4xl font-black bg-gradient-to-r from-red-400 to-rose-500 bg-clip-text text-transparent">
              {revealedCategory.categoryName}
            </h2>
          </motion.div>
        </motion.div>
      </motion.main>
    );
  }

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col p-4 md:p-8"
    >
      {/* Header */}
      <div className="text-center py-4">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/20 text-red-400 mb-4"
        >
          <span className="text-lg">✊✌️✋</span>
          <span className="font-bold">Schere, Stein, Papier</span>
          {phase === 'choosing' && (
            <span className="text-xs bg-red-500/30 px-2 py-0.5 rounded-full">
              Runde {currentRound}{currentRound <= 3 ? '/3' : ' (Verlängerung)'}
            </span>
          )}
        </motion.div>

        <motion.h1
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-2xl md:text-3xl font-black"
        >
          {phase === 'selecting' && 'Die Herausforderer werden gewählt...'}
          {phase === 'choosing' && 'Wähle deine Waffe!'}
          {phase === 'revealing' && (lastRoundResult?.roundWinner === 'tie' ? 'Unentschieden!' : 'Ergebnis...')}
          {phase === 'result' && `${winnerId === effectivePlayer1?.id ? effectivePlayer1?.name : effectivePlayer2?.name} gewinnt!`}
          {phase === 'picking' && 'Der Sieger wählt...'}
        </motion.h1>

        {/* Timer */}
        {phase === 'choosing' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full mt-4 ${
              timeLeft <= 3 ? 'bg-red-500/20 text-red-500' : 'glass'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span className="font-mono font-bold">{timeLeft}s</span>
          </motion.div>
        )}
      </div>

      {/* Duel Arena */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Score Display */}
        <div className="flex items-center justify-center gap-8 mb-8">
          <PlayerCard 
            player={effectivePlayer1} 
            wins={player1Wins} 
            isWinner={winnerId === effectivePlayer1?.id}
            isLeft
            choice={lastRoundResult?.player1Choice}
            hasChosen={isPlayer1 ? !!myChoice : opponentChosen}
            showChoice={phase === 'revealing' || phase === 'result'}
          />

          {/* VS / Score */}
          <div className="flex flex-col items-center">
            <motion.div
              animate={phase === 'revealing' ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 0.3 }}
              className="text-4xl font-black text-red-500"
            >
              {player1Wins} - {player2Wins}
            </motion.div>
            <span className="text-sm text-muted-foreground">Best of 3</span>
          </div>

          <PlayerCard 
            player={effectivePlayer2} 
            wins={player2Wins} 
            isWinner={winnerId === effectivePlayer2?.id}
            choice={lastRoundResult?.player2Choice}
            hasChosen={!isPlayer1 ? !!myChoice : opponentChosen}
            showChoice={phase === 'revealing' || phase === 'result'}
          />
        </div>

        {/* Round Results History */}
        {roundResults.length > 0 && (
          <div className="flex gap-4 mb-8">
            {roundResults.map((result, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full glass text-sm"
              >
                <span>R{result.round}:</span>
                <span>{RPS_CONFIG[result.player1Choice].emoji}</span>
                <span className="text-muted-foreground">vs</span>
                <span>{RPS_CONFIG[result.player2Choice].emoji}</span>
                <span className={result.roundWinner === 'player1' ? 'text-emerald-400' : result.roundWinner === 'player2' ? 'text-red-400' : 'text-yellow-400'}>
                  {result.roundWinner === 'tie' ? '🤝' : result.roundWinner === 'player1' ? '←' : '→'}
                </span>
              </motion.div>
            ))}
          </div>
        )}

        {/* Choice Buttons */}
        {phase === 'choosing' && isParticipant && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="flex gap-4"
          >
            {(['rock', 'paper', 'scissors'] as RPSChoice[]).map((choice, i) => (
              <motion.button
                key={choice}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleChoice(choice)}
                disabled={!!myChoice}
                className={`relative w-24 h-24 md:w-32 md:h-32 rounded-2xl font-bold text-4xl md:text-5xl transition-all ${
                  myChoice === choice
                    ? `bg-gradient-to-br ${RPS_CONFIG[choice].color} ring-4 ring-white/50`
                    : myChoice
                    ? 'glass opacity-40'
                    : `glass hover:bg-gradient-to-br hover:${RPS_CONFIG[choice].color}`
                }`}
              >
                {myChoice === choice && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center"
                  >
                    <Check className="w-4 h-4 text-black" />
                  </motion.div>
                )}
                {RPS_CONFIG[choice].emoji}
                <span className="block text-xs mt-1">{RPS_CONFIG[choice].name}</span>
              </motion.button>
            ))}
          </motion.div>
        )}

        {/* Waiting message for participants */}
        {phase === 'choosing' && isParticipant && myChoice && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 text-muted-foreground animate-pulse"
          >
            {opponentChosen ? 'Beide haben gewählt!' : 'Warte auf Gegner...'}
          </motion.p>
        )}

        {/* Spectator message */}
        {phase === 'choosing' && !isParticipant && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Warte auf die Spieler...
              {(myChoice || opponentChosen) && ` (${[myChoice, opponentChosen].filter(Boolean).length}/2 gewählt)`}
            </span>
          </motion.p>
        )}
      </div>

      {/* Category Picking (for winner) */}
      {phase === 'picking' && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="pb-4"
        >
          {/* Timer */}
          <div className="text-center mb-4">
            <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
              timeLeft <= 5 ? 'bg-red-500/20 text-red-400' : 'glass'
            }`}>
              <Clock className="w-4 h-4" />
              {timeLeft}s
            </span>
          </div>

          {/* Categories */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto">
            {categories.map((cat, i) => {
              const isSelected = selectedCategory === cat.id;
              return (
                <motion.button
                  key={cat.id}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.05 * i }}
                  onClick={() => handlePick(cat.id)}
                  disabled={!isWinner || !!selectedCategory}
                  className={`relative p-4 rounded-xl text-center transition-all ${
                    isWinner && !selectedCategory
                      ? 'glass hover:bg-red-500/20 hover:border-red-500/50 cursor-pointer'
                      : 'glass opacity-60'
                  } ${isSelected ? 'ring-2 ring-red-500 bg-red-500/20' : ''}`}
                >
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center"
                    >
                      <Check className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                  <span className="text-2xl block mb-1">{cat.icon}</span>
                  <span className="font-bold text-xs">{cat.name}</span>
                </motion.button>
              );
            })}
          </div>

          {!isWinner && (
            <p className="text-center text-muted-foreground mt-4 animate-pulse">
              Der Sieger wählt die Kategorie...
            </p>
          )}
        </motion.div>
      )}
    </motion.main>
  );
}

// Player Card Component
function PlayerCard({
  player,
  wins,
  isWinner,
  isLeft = false,
  choice,
  hasChosen,
  showChoice,
}: {
  player: DuelPlayer | null;
  wins: number;
  isWinner: boolean;
  isLeft?: boolean;
  choice?: RPSChoice;
  hasChosen: boolean;
  showChoice: boolean;
}) {
  if (!player) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-muted/50 animate-pulse" />
        <p className="mt-2 font-bold text-muted-foreground">???</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ x: isLeft ? -100 : 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 200 }}
      className="flex flex-col items-center"
    >
      {/* Winner Crown */}
      <AnimatePresence>
        {isWinner && (
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            className="mb-2"
          >
            <Crown className="w-8 h-8 text-red-500" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Avatar */}
      <div className="relative">
        <img
          src={getAvatarUrlFromSeed(player.avatarSeed, isWinner ? 'superHappy' : 'hopeful')}
          alt=""
          className={`w-20 h-20 md:w-24 md:h-24 rounded-full bg-muted border-4 ${
            isWinner ? 'border-red-500 shadow-lg shadow-red-500/30' : 'border-white/20'
          }`}
        />
        
        {/* Win indicators */}
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
          {[0, 1].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full ${
                i < wins ? 'bg-emerald-500' : 'bg-muted'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Name */}
      <p className="mt-4 font-bold text-sm md:text-base">{player.name}</p>

      {/* Choice Display */}
      <div className="mt-4 h-16 flex items-center justify-center">
        <AnimatePresence mode="wait">
          {showChoice && choice ? (
            <motion.div
              key="choice"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400 }}
              className={`w-14 h-14 rounded-xl bg-gradient-to-br ${RPS_CONFIG[choice].color} flex items-center justify-center text-3xl`}
            >
              {RPS_CONFIG[choice].emoji}
            </motion.div>
          ) : hasChosen ? (
            <motion.div
              key="waiting"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-14 h-14 rounded-xl glass flex items-center justify-center"
            >
              <motion.span
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ repeat: Infinity, duration: 0.5 }}
                className="text-2xl"
              >
                🤔
              </motion.span>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              className="w-14 h-14 rounded-xl glass opacity-40 flex items-center justify-center text-2xl"
            >
              ❓
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

