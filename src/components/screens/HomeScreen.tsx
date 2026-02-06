'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useScroll, useTransform, useInView } from 'framer-motion';
import { useSocket } from '@/hooks/useSocket';
import { useGameStore } from '@/store/gameStore';
import { loadSession, clearSession, type GameSession } from '@/lib/session';
import { ROOM_VALIDATION } from '@/config/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  Zap,
  Users,
  ArrowRight,
  Loader2,
  Trophy,
  Brain,
  RotateCcw,
  X,
  Gamepad2,
  Timer,
  Swords,
  Dices,
  Flame,
  ListOrdered,
  Sparkles,
  Music,
  Tv,
  Film,
  Globe,
  Beaker,
  Car,
  Dumbbell,
  Book,
  Smartphone,
  Crown
} from 'lucide-react';
import Image from 'next/image';

// --- DATA ---

const CATEGORIES = [
  { name: 'Gaming', icon: Gamepad2, color: 'from-emerald-500 to-teal-600' },
  { name: 'Filme & Serien', icon: Film, color: 'from-red-500 to-rose-600' },
  { name: 'Anime & Manga', icon: Sparkles, color: 'from-pink-400 to-rose-500' },
  { name: 'Star Wars', icon: Swords, color: 'from-yellow-400 to-orange-500' },
  { name: 'Marvel', icon: Zap, color: 'from-red-600 to-red-800' },
  { name: 'Harry Potter', icon: Sparkles, color: 'from-amber-400 to-orange-600' },
  { name: 'Herr der Ringe', icon: Crown, color: 'from-yellow-500 to-amber-700' },
  { name: 'Musik', icon: Music, color: 'from-cyan-400 to-blue-500' },
  { name: 'Wissenschaft', icon: Beaker, color: 'from-emerald-400 to-teal-600' },
  { name: 'Technik', icon: Smartphone, color: 'from-slate-400 to-slate-600' },
  { name: 'Allgemeinwissen', icon: Brain, color: 'from-blue-500 to-cyan-600' },
  { name: 'Mythologie', icon: Book, color: 'from-orange-300 to-amber-500' },
  { name: 'Fahrzeuge', icon: Car, color: 'from-orange-400 to-red-500' },
  { name: 'Sport', icon: Dumbbell, color: 'from-green-500 to-emerald-600' },
  { name: 'Internet & Memes', icon: Globe, color: 'from-blue-400 to-cyan-500' },
  { name: 'Cartoons', icon: Tv, color: 'from-yellow-400 to-amber-500' },
];

const FEATURES = [
  {
    title: "Live Multiplayer",
    desc: "Spiele mit bis zu 12 Freunden gleichzeitig in Echtzeit.",
    icon: Users,
    color: "bg-blue-500/10 text-blue-500"
  },
  {
    title: "17 Kategorien",
    desc: "Von Allgemeinwissen bis Nerd-Spezialwissen.",
    icon: Brain,
    color: "bg-teal-500/10 text-teal-500"
  },
  {
    title: "Bonus Runden",
    desc: "Abwechslung durch Hot Button & Collective List.",
    icon: StarBadge, // Helper component defined below
    color: "bg-amber-500/10 text-amber-500"
  },
  {
    title: "Minigames",
    desc: "Klär Unentschieden im Dice Royale oder RPS Duell.",
    icon: Dices,
    color: "bg-emerald-500/10 text-emerald-500"
  }
];

const BONUS_ROUNDS = [
  {
    id: 'hot-button',
    title: 'Hot Button',
    subtitle: 'Schnelligkeit ist alles',
    desc: 'Buzzer dich als Erster rein! Aber Vorsicht: Falsche Antworten kosten Punkte.',
    gradient: 'from-red-500/20 via-orange-500/20 to-red-500/20',
    border: 'border-red-500/30',
    icon: Flame
  },
  {
    id: 'collective',
    title: 'Collective List',
    subtitle: 'Teamwork gefragt',
    desc: 'Findet gemeinsam alle Elemente einer Liste. Wie viele Pokémon kennt ihr?',
    gradient: 'from-blue-500/20 via-cyan-500/20 to-blue-500/20',
    border: 'border-blue-500/30',
    icon: ListOrdered
  }
];

// --- HELPER COMPONENTS ---

function StarBadge({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function GridBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      <div className="absolute top-0 left-0 right-0 h-[500px] bg-gradient-to-b from-emerald-500/10 via-transparent to-transparent blur-3xl" />
      <div className="absolute bottom-0 left-0 right-0 h-[300px] bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}

// --- MAIN PAGE ---

export function HomeScreen() {
  const router = useRouter();
  const { createRoom, joinRoom } = useSocket();
  const isConnected = useGameStore((s) => s.isConnected);

  const [dialogMode, setDialogMode] = useState<'none' | 'create' | 'join'>('none');
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingSession, setExistingSession] = useState<GameSession | null>(null);
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // Parallax / Scroll Effects
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 500], [0, 200]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0]);

  useEffect(() => {
    const session = loadSession();
    if (session) {
      setExistingSession(session);
      setName(session.playerName);
    }
  }, []);

  const handleDismissSession = () => {
    clearSession();
    setExistingSession(null);
  };

  const handleRejoin = () => {
    if (existingSession) router.push(`/room/${existingSession.roomCode}`);
  };

  const handleCreate = async () => {
    if (!name.trim()) return setError('Name wird benötigt');
    setLoading(true); setError(null);
    const result = await createRoom(name.trim());
    if (result.success && result.roomCode) router.push(`/room/${result.roomCode}`);
    else { setError(result.error || 'Fehler beim Erstellen'); setLoading(false); }
  };

  const handleJoin = async () => {
    if (!name.trim()) return setError('Name wird benötigt');
    if (roomCode.length !== ROOM_VALIDATION.CODE_LENGTH) return setError(`Code muss ${ROOM_VALIDATION.CODE_LENGTH} Zeichen haben`);
    setLoading(true); setError(null);
    const result = await joinRoom(roomCode.toUpperCase(), name.trim());
    if (result.success) router.push(`/room/${roomCode.toUpperCase()}`);
    else { setError(result.error || 'Fehler beim Beitreten'); setLoading(false); }
  };

  const closeDialog = () => {
    setDialogMode('none');
    setError(null);
    setLoading(false);
  };

  const createForm = (
    <div className="space-y-4 py-4">
      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dein Name</label>
        <Input
          placeholder="z.B. QuizMaster"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && name.trim() && handleCreate()}
          className="bg-zinc-900 border-zinc-800 h-12 text-lg focus-visible:ring-emerald-500"
          autoFocus={isDesktop}
        />
      </div>

      {error && <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">{error}</p>}

      <Button
        className="w-full h-12 text-lg font-bold bg-emerald-600 hover:bg-emerald-500"
        onClick={handleCreate}
        disabled={loading || !name.trim()}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Lobby öffnen'}
      </Button>
    </div>
  );

  const joinForm = (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-5 gap-4">
        <div className="col-span-3 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dein Name</label>
          <Input
            placeholder="Spielername"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && roomCode.length === ROOM_VALIDATION.CODE_LENGTH && handleJoin()}
            className="bg-zinc-900 border-zinc-800 h-14"
            autoFocus={isDesktop}
          />
        </div>
        <div className="col-span-2 space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Code</label>
          <Input
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && roomCode.length === ROOM_VALIDATION.CODE_LENGTH && handleJoin()}
            placeholder="ABCD"
            maxLength={ROOM_VALIDATION.CODE_LENGTH}
            className="bg-zinc-900 border-zinc-800 h-14 text-center font-mono text-2xl tracking-widest uppercase focus-visible:ring-emerald-500"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-400 bg-red-400/10 p-2 rounded">{error}</p>}

      <Button
        className="w-full h-12 text-lg font-bold bg-emerald-600 hover:bg-emerald-500"
        onClick={handleJoin}
        disabled={loading || !name.trim() || roomCode.length !== ROOM_VALIDATION.CODE_LENGTH}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Beitreten'}
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen relative bg-background text-foreground overflow-x-hidden selection:bg-primary/30">
      <GridBackground />

      {/* --- NAVBAR --- */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-600 to-cyan-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Nerd<span className="text-emerald-400">Battle</span></span>
          </div>

          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium transition-colors ${isConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
              {isConnected ? <Zap className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
              <span className="hidden sm:inline">{isConnected ? 'Server Online' : 'Verbinde...'}</span>
            </div>
          </div>
        </div>
      </nav>

      {/* --- SESSION RESTORE --- */}
      <AnimatePresence>
        {existingSession && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="fixed bottom-6 right-6 z-40 max-w-sm w-full"
          >
            <div className="bg-card/95 backdrop-blur border border-border p-4 rounded-xl shadow-2xl flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-0.5">Laufendes Spiel</p>
                <p className="text-sm font-medium">Raum <span className="font-mono text-primary">{existingSession.roomCode}</span> fortsetzen?</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleRejoin}>Ja, weiter</Button>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleDismissSession}><X className="w-4 h-4" /></Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- HERO SECTION --- */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-4 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div
          style={{ y: heroY, opacity: heroOpacity }}
          className="space-y-8 max-w-4xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm font-medium"
          >
            <Sparkles className="w-4 h-4" />
            <span>Jetzt mit neuen Bonus Runden!</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.9]"
          >
            Das ultimative <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-cyan-400 to-teal-400">
              Nerd Battle
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Beweise dein Wissen in <strong>17 Kategorien</strong>.
            Vom klassischen Quiz bis zu nervenaufreibenden Bonus-Runden.
            Komplett kostenlos & Open Source.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
          >
            <Button
              size="lg"
              className="h-14 px-8 text-lg rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-xl shadow-emerald-600/20 w-full sm:w-auto transition-transform hover:scale-105"
              onClick={() => setDialogMode('create')}
              disabled={!isConnected}
            >
              <Zap className="w-5 h-5 mr-2 fill-current" />
              Raum erstellen
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-14 px-8 text-lg rounded-2xl border-white/10 hover:bg-white/5 hover:text-white w-full sm:w-auto"
              onClick={() => setDialogMode('join')}
              disabled={!isConnected}
            >
              Code eingeben
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* --- STATS CARD (Absolute/Floating) --- */}
      <div className="relative max-w-7xl mx-auto px-4 -mt-12 mb-24 z-10 hidden md:block">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-4 gap-px bg-white/5 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-md"
        >
          {[
            { label: 'Fragen', val: '2,500+', icon: Book },
            { label: 'Kategorien', val: '17', icon: ListOrdered },
            { label: 'Max. Spieler', val: '12', icon: Users },
            { label: 'Kosten', val: '0€', icon: Trophy },
          ].map((stat, i) => (
            <div key={i} className="p-6 flex flex-col items-center text-center hover:bg-white/5 transition-colors group">
              <stat.icon className="w-6 h-6 text-muted-foreground group-hover:text-primary mb-2 transition-colors" />
              <span className="text-2xl font-bold">{stat.val}</span>
              <span className="text-sm text-muted-foreground uppercase tracking-wider">{stat.label}</span>
            </div>
          ))}
        </motion.div>
      </div>

      {/* --- FEATURE GRID --- */}
      <section className="py-24 px-4 bg-muted/20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Mehr als nur ein Quiz</h2>
            <p className="text-muted-foreground text-lg">Ein komplettes Game-Show Erlebnis für dich und deine Freunde.</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {FEATURES.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5 }}
                className="p-6 rounded-3xl bg-card border border-border/50 shadow-sm hover:shadow-xl hover:border-primary/20 transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-2xl ${feature.color} flex items-center justify-center mb-4`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- BONUS ROUNDS SHOWCASE --- */}
      <section className="py-24 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row gap-4 items-end justify-between mb-12">
            <div>
              <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest mb-2 block">New Features</span>
              <h2 className="text-4xl md:text-5xl font-bold">Bonus Rounds</h2>
            </div>
            <p className="text-muted-foreground max-w-md text-right hidden md:block">
              Spezial-Modi, die das Spielgeschehen auf den Kopf stellen und für Abwechslung sorgen.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {BONUS_ROUNDS.map((round, i) => (
              <motion.div
                key={round.id}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className={`relative group overflow-hidden rounded-3xl border ${round.border} bg-card p-8 h-full min-h-[300px] flex flex-col justify-end`}
              >
                {/* Background Gradient */}
                <div className={`absolute inset-0 bg-gradient-to-br ${round.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

                {/* Content */}
                <div className="relative z-10">
                  <div className="w-14 h-14 rounded-2xl bg-background/50 backdrop-blur border border-white/10 flex items-center justify-center mb-6">
                    <round.icon className="w-7 h-7" />
                  </div>
                  <h3 className="text-3xl font-black mb-1">{round.title}</h3>
                  <p className="text-sm font-bold opacity-70 mb-4 uppercase tracking-widest">{round.subtitle}</p>
                  <p className="text-lg text-muted-foreground group-hover:text-foreground transition-colors">
                    {round.desc}
                  </p>
                </div>

                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity transform group-hover:scale-110 duration-700">
                  <round.icon className="w-48 h-48" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- CATEGORIES PREVIEW --- */}
      <section className="py-20 border-y border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold mb-10 text-center text-muted-foreground">
            Wähle aus <span className="text-foreground">17 Kategorien</span>
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {CATEGORIES.map((cat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ delay: i * 0.02 }}
                whileHover={{ y: -5, filter: 'brightness(1.2)' }}
                className="group relative h-32 rounded-xl overflow-hidden cursor-default bg-card border border-white/5"
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${cat.color} opacity-10 group-hover:opacity-20 transition-opacity`} />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4">
                  <cat.icon className="w-8 h-8 opacity-70 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300" />
                  <div className="text-center">
                    <span className="block font-bold text-sm leading-tight">{cat.name}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* --- FOOTER --- */}
      <footer className="py-12 px-4 border-t border-white/5 mt-auto bg-black/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Brain className="w-5 h-5" />
            <span className="font-bold">NerdBattle</span>
            <span className="text-xs opacity-50 ml-2">v2.0 Next Gen</span>
          </div>

          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="https://github.com/Fizzyy89" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">GitHub</a>
            <a href="#" className="hover:text-white transition-colors">Datenschutz</a>
            <a href="#" className="hover:text-white transition-colors">Impressum</a>
          </div>

          <p className="text-xs text-muted-foreground/50">
            Made with <span className="text-red-500">♥</span> for Nerds
          </p>
        </div>
      </footer>

      {/* --- DIALOGS (Keep logic, update styling) --- */}

      {/* --- DIALOGS / DRAWERS --- */}
      {isDesktop ? (
        <>
          <Dialog open={dialogMode === 'create'} onOpenChange={(open) => !open && closeDialog()}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Zap className="w-5 h-5 text-emerald-500" />
                  Lobby erstellen
                </DialogTitle>
                <DialogDescription>
                  Starte ein neues Spiel und lade deine Freunde ein.
                </DialogDescription>
              </DialogHeader>
              {createForm}
            </DialogContent>
          </Dialog>

          <Dialog open={dialogMode === 'join'} onOpenChange={(open) => !open && closeDialog()}>
            <DialogContent className="sm:max-w-md bg-zinc-950 border-zinc-800 text-white">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <Users className="w-5 h-5 text-emerald-500" />
                  Spiel beitreten
                </DialogTitle>
                <DialogDescription>
                  Gib den 4-stelligen Code ein, den dir der Host gegeben hat.
                </DialogDescription>
              </DialogHeader>
              {joinForm}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <>
          <Drawer open={dialogMode === 'create'} onOpenChange={(open) => !open && closeDialog()}>
            <DrawerContent className="bg-zinc-950 border-zinc-800 text-white">
              <DrawerHeader className="text-left">
                <DrawerTitle className="flex items-center gap-2 text-xl">
                  <Zap className="w-5 h-5 text-emerald-500" />
                  Lobby erstellen
                </DrawerTitle>
                <DrawerDescription>
                  Starte ein neues Spiel und lade deine Freunde ein.
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-8">
                {createForm}
              </div>
            </DrawerContent>
          </Drawer>

          <Drawer open={dialogMode === 'join'} onOpenChange={(open) => !open && closeDialog()}>
            <DrawerContent className="bg-zinc-950 border-zinc-800 text-white">
              <DrawerHeader className="text-left">
                <DrawerTitle className="flex items-center gap-2 text-xl">
                  <Users className="w-5 h-5 text-emerald-500" />
                  Spiel beitreten
                </DrawerTitle>
                <DrawerDescription>
                  Gib den 4-stelligen Code ein.
                </DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-8">
                {joinForm}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}

    </div>
  );
}
