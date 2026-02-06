'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/gameStore';
import { useAudio } from '@/hooks/useAudio';

const WHEEL_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#22c55e', // green
  '#eab308', // yellow
  '#a855f7', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#6366f1', // indigo
  '#14b8a6', // teal
  '#f43f5e', // rose
  '#84cc16', // lime
];

// Optimal number of segments for a wheel
const WHEEL_SEGMENTS = 8;

export function CategoryWheelScreen() {
  const room = useGameStore((s) => s.room);
  const { playSfx } = useAudio();
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const hasStarted = useRef(false);

  // Take only the first WHEEL_SEGMENTS categories for the wheel
  const allCategories = room?.votingCategories || [];
  const categories = allCategories.slice(0, WHEEL_SEGMENTS);
  const segmentAngle = categories.length > 0 ? 360 / categories.length : 45;
  
  // Get the pre-selected index from room state
  const wheelSelectedIndex = room?.wheelSelectedIndex ?? null;

  const startSpin = (idx: number) => {
    if (categories.length === 0) return;
    if (hasStarted.current) return;
    hasStarted.current = true;

    // Adjust index if server sent index beyond our displayed categories
    const adjustedIndex = idx % categories.length;
    setSelectedIndex(adjustedIndex);
    setSpinning(true);
    playSfx('wheelSpin');

    // Calculate target rotation
    // The wheel is drawn with segment 0 at the top (starting at -90° in SVG coords)
    // The pointer is at the top
    // When we rotate the wheel clockwise, segment N needs to end up at the top
    const fullSpins = 5 + Math.floor(Math.random() * 3); // 5-7 full rotations
    const segmentCenterAngle = adjustedIndex * segmentAngle + segmentAngle / 2;
    const targetAngle = 360 - segmentCenterAngle;
    const totalRotation = fullSpins * 360 + targetAngle;

    console.log(`🎡 Spinning to index ${adjustedIndex}, segment angle: ${segmentCenterAngle}°, target: ${targetAngle}°, total: ${totalRotation}°`);

    setRotation(totalRotation);

    setTimeout(() => {
      setSpinning(false);
      setShowResult(true);
    }, 5000);
  };

  // Start spinning when we have both categories and a selected index from the server
  useEffect(() => {
    if (categories.length === 0) return;
    if (wheelSelectedIndex === null) return;
    if (hasStarted.current) return;
    
    // Small delay to ensure the component is fully rendered
    const timer = setTimeout(() => {
      startSpin(wheelSelectedIndex);
    }, 100);
    
    return () => clearTimeout(timer);
  }, [categories.length, wheelSelectedIndex]);

  // Reset state when component unmounts or phase changes
  useEffect(() => {
    return () => {
      hasStarted.current = false;
    };
  }, []);

  if (categories.length === 0) return null;

  const selectedCategory = selectedIndex !== null ? categories[selectedIndex] : null;

  // SVG Wheel generation
  const size = 320;
  const center = size / 2;
  const radius = size / 2 - 10;

  const createSegmentPath = (index: number) => {
    const startAngle = (index * segmentAngle - 90) * (Math.PI / 180);
    const endAngle = ((index + 1) * segmentAngle - 90) * (Math.PI / 180);
    
    const x1 = center + radius * Math.cos(startAngle);
    const y1 = center + radius * Math.sin(startAngle);
    const x2 = center + radius * Math.cos(endAngle);
    const y2 = center + radius * Math.sin(endAngle);
    
    const largeArc = segmentAngle > 180 ? 1 : 0;
    
    return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
  };

  const getTextPosition = (index: number) => {
    const angle = ((index + 0.5) * segmentAngle - 90) * (Math.PI / 180);
    const textRadius = radius * 0.65;
    return {
      x: center + textRadius * Math.cos(angle),
      y: center + textRadius * Math.sin(angle),
      rotation: (index + 0.5) * segmentAngle,
    };
  };

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen flex flex-col items-center justify-center p-4 overflow-hidden"
    >
      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h1 className="text-4xl md:text-5xl font-black mb-2">
          <span className="text-purple-500">🎡</span> Glücksrad
        </h1>
        <p className="text-muted-foreground">
          {spinning ? 'Das Rad dreht sich...' : showResult ? 'Das Schicksal hat entschieden!' : 'Bereit zum Drehen!'}
        </p>
      </motion.div>

      {/* Wheel Container */}
      <div className="relative">
        {/* Pointer */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
          <div className="w-0 h-0 border-l-[18px] border-r-[18px] border-t-[28px] border-l-transparent border-r-transparent border-t-white drop-shadow-lg" />
        </div>

        {/* Wheel SVG */}
        <motion.div
          animate={{ rotate: rotation }}
          transition={{
            duration: 5,
            ease: [0.15, 0.85, 0.25, 1],
          }}
          style={{ transformOrigin: 'center center' }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            className="drop-shadow-2xl"
          >
            {/* Outer ring */}
            <circle
              cx={center}
              cy={center}
              r={radius + 5}
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="10"
            />

            {/* Segments */}
            {categories.map((cat, i) => {
              const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
              const textPos = getTextPosition(i);

              return (
                <g key={cat.id}>
                  {/* Segment */}
                  <path
                    d={createSegmentPath(i)}
                    fill={color}
                    stroke="rgba(255,255,255,0.3)"
                    strokeWidth="2"
                  />
                  {/* Emoji */}
                  <text
                    x={textPos.x}
                    y={textPos.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize="24"
                    transform={`rotate(${textPos.rotation}, ${textPos.x}, ${textPos.y})`}
                  >
                    {cat.icon}
                  </text>
                </g>
              );
            })}

            {/* Center circle */}
            <circle
              cx={center}
              cy={center}
              r={40}
              fill="white"
              className="drop-shadow-lg"
            />
            <circle
              cx={center}
              cy={center}
              r={35}
              fill="url(#centerGradient)"
            />
            <text
              x={center}
              y={center}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="28"
            >
              🎲
            </text>

            {/* Gradient definition */}
            <defs>
              <radialGradient id="centerGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f0f0f0" />
                <stop offset="100%" stopColor="#d0d0d0" />
              </radialGradient>
            </defs>
          </svg>
        </motion.div>

        {/* Glow effect when spinning */}
        {spinning && (
          <motion.div
            className="absolute inset-0 rounded-full pointer-events-none"
            animate={{
              boxShadow: [
                '0 0 30px rgba(168, 85, 247, 0.4)',
                '0 0 80px rgba(168, 85, 247, 0.7)',
                '0 0 30px rgba(168, 85, 247, 0.4)',
              ],
            }}
            transition={{ duration: 0.4, repeat: Infinity }}
          />
        )}

        {/* Tick sound effect visual */}
        {spinning && (
          <motion.div
            className="absolute -top-4 left-1/2 -translate-x-1/2"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 0.1, repeat: Infinity }}
          >
            <div className="text-2xl">✨</div>
          </motion.div>
        )}
      </div>

      {/* Category names legend */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mt-6 flex flex-wrap justify-center gap-2 max-w-md"
      >
        {categories.map((cat, i) => (
          <div
            key={cat.id}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-full"
            style={{ backgroundColor: `${WHEEL_COLORS[i % WHEEL_COLORS.length]}40` }}
          >
            <span>{cat.icon}</span>
            <span className="text-white/80">{cat.name}</span>
          </div>
        ))}
      </motion.div>

      {/* Result */}
      {showResult && selectedCategory && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="mt-8 text-center"
        >
          <div className="glass px-8 py-6 rounded-2xl border-purple-500/50 glow-accent">
            <p className="text-sm text-muted-foreground mb-2">Es wird gespielt:</p>
            <div className="flex items-center justify-center gap-3">
              <span className="text-4xl">{selectedCategory.icon}</span>
              <span className="text-3xl font-black text-purple-500">{selectedCategory.name}</span>
            </div>
          </div>
        </motion.div>
      )}
    </motion.main>
  );
}
