import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { Lock, Mail, Loader2, AlertCircle } from 'lucide-react';

// 5 Welcome Back variations - each with full translations (20% chance each)
const WELCOME_BACK_VARIATIONS = [
    // 1. Classic "Welcome Back"
    [
        { text: 'Welcome Back', lang: 'en' },
        { text: 'С возвращением', lang: 'ru' },
        { text: 'مرحباً بعودتك', lang: 'ar' },
        { text: 'З поверненням', lang: 'uk' },
        { text: 'Bon retour', lang: 'fr' },
        { text: 'Xoş gəldiniz', lang: 'az' },
    ],
    // 2. Warm "Good to see you"
    [
        { text: 'Good to see you', lang: 'en' },
        { text: 'Рад тебя видеть', lang: 'ru' },
        { text: 'سعيد برؤيتك', lang: 'ar' },
        { text: 'Радий тебе бачити', lang: 'uk' },
        { text: 'Content de te voir', lang: 'fr' },
        { text: 'Səni görmək xoşdur', lang: 'az' },
    ],
    // 3. Energetic "Ready to dive in?"
    [
        { text: 'Ready to dive in?', lang: 'en' },
        { text: 'Готов погрузиться?', lang: 'ru' },
        { text: 'مستعد للبدء؟', lang: 'ar' },
        { text: 'Готовий зануритись?', lang: 'uk' },
        { text: 'Prêt à plonger?', lang: 'fr' },
        { text: 'Başlamağa hazırsan?', lang: 'az' },
    ],
    // 4. Business "Back to business"
    [
        { text: 'Back to business', lang: 'en' },
        { text: 'Вернёмся к делу', lang: 'ru' },
        { text: 'العودة للعمل', lang: 'ar' },
        { text: 'Повертаємось до справ', lang: 'uk' },
        { text: 'Retour aux affaires', lang: 'fr' },
        { text: 'İşə qayıdaq', lang: 'az' },
    ],
    // 5. Slang/Fun "What up, Dog?"
    [
        { text: 'Whats up, Dog?', lang: 'en' },
        { text: 'Как сам, легенда?', lang: 'ru' },
        { text: 'عامل إيه؟', lang: 'ar' },
        { text: 'Шо як?', lang: 'uk' },
        { text: 'Ça roule?', lang: 'fr' },
        { text: 'Nə var, nə yox?', lang: 'az' },
    ],
];

// Texts for first-time visitors
const WELCOME_TEXTS = [
    { text: 'Welcome', lang: 'en' },
    { text: 'Добро пожаловать', lang: 'ru' },
    { text: 'أهلاً وسهلاً', lang: 'ar' },
    { text: 'Ласкаво просимо', lang: 'uk' },
    { text: 'Bienvenue', lang: 'fr' },
    { text: 'Xoş gəlmisiniz', lang: 'az' },
];

type BackgroundStyle = 'aurora' | 'mesh' | 'particles' | 'grid';
const BACKGROUND_STYLES: BackgroundStyle[] = ['aurora', 'mesh', 'particles', 'grid'];

// Aurora Background
const AuroraBackground = () => (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
        <div
            className="absolute inset-[-50%] w-[200%] h-[200%]"
            style={{
                background: `
                    radial-gradient(ellipse 80% 50% at 20% 40%, rgba(120, 80, 220, 0.5) 0%, transparent 60%),
                    radial-gradient(ellipse 60% 40% at 70% 30%, rgba(80, 100, 220, 0.4) 0%, transparent 55%),
                    radial-gradient(ellipse 70% 50% at 50% 80%, rgba(100, 60, 180, 0.4) 0%, transparent 50%)
                `,
                animation: 'aurora-rotate 25s ease-in-out infinite',
            }}
        />
        <div
            className="absolute inset-[-30%] w-[160%] h-[160%]"
            style={{
                background: `
                    radial-gradient(ellipse 50% 60% at 80% 50%, rgba(139, 92, 246, 0.3) 0%, transparent 50%),
                    radial-gradient(ellipse 60% 40% at 30% 60%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)
                `,
                animation: 'aurora-rotate 20s ease-in-out infinite reverse',
            }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-950/30 to-slate-950/80" />
    </div>
);

// Mesh Gradient Background
const MeshBackground = () => (
    <div className="absolute inset-0 overflow-hidden bg-slate-950">
        <div
            className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-60"
            style={{
                background: 'radial-gradient(circle, rgba(147, 51, 234, 0.7) 0%, rgba(147, 51, 234, 0) 70%)',
                filter: 'blur(60px)',
                animation: 'blob-move 15s ease-in-out infinite',
            }}
        />
        <div
            className="absolute -top-20 -right-20 w-[450px] h-[450px] rounded-full opacity-50"
            style={{
                background: 'radial-gradient(circle, rgba(99, 102, 241, 0.7) 0%, rgba(99, 102, 241, 0) 70%)',
                filter: 'blur(60px)',
                animation: 'blob-move 12s ease-in-out infinite reverse',
                animationDelay: '-3s',
            }}
        />
        <div
            className="absolute -bottom-32 left-20 w-[500px] h-[500px] rounded-full opacity-50"
            style={{
                background: 'radial-gradient(circle, rgba(59, 130, 246, 0.6) 0%, rgba(59, 130, 246, 0) 70%)',
                filter: 'blur(70px)',
                animation: 'blob-move 18s ease-in-out infinite',
                animationDelay: '-7s',
            }}
        />
        <div
            className="absolute bottom-10 -right-20 w-[400px] h-[400px] rounded-full opacity-40"
            style={{
                background: 'radial-gradient(circle, rgba(139, 92, 246, 0.6) 0%, rgba(139, 92, 246, 0) 70%)',
                filter: 'blur(50px)',
                animation: 'blob-move 14s ease-in-out infinite',
                animationDelay: '-5s',
            }}
        />
    </div>
);

// Particles Background - Twinkling starfield
const ParticlesBackground = () => {
    const particles = useMemo(() =>
        Array.from({ length: 60 }, (_, i) => ({
            id: i,
            size: Math.random() * 2.5 + 0.5,
            x: Math.random() * 100,
            y: Math.random() * 100,
            twinkleDuration: 2 + Math.random() * 4, // 2-6s twinkle
            twinkleDelay: Math.random() * 5,
        })), []
    );

    return (
        <div className="absolute inset-0 overflow-hidden bg-slate-950">
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/30 via-slate-950 to-slate-950" />
            {/* Twinkling stars */}
            {particles.map((p) => (
                <div
                    key={p.id}
                    className="absolute rounded-full bg-white"
                    style={{
                        width: p.size,
                        height: p.size,
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        boxShadow: `0 0 ${p.size * 2}px rgba(255,255,255,0.6)`,
                        animation: `twinkle ${p.twinkleDuration}s ease-in-out infinite`,
                        animationDelay: `${p.twinkleDelay}s`,
                    }}
                />
            ))}
            {/* Ambient glowing orbs */}
            {[...Array(6)].map((_, i) => (
                <div
                    key={`orb-${i}`}
                    className="absolute rounded-full animate-pulse"
                    style={{
                        width: 100 + i * 30,
                        height: 100 + i * 30,
                        left: `${10 + i * 15}%`,
                        top: `${15 + (i % 3) * 25}%`,
                        background: `radial-gradient(circle, rgba(99, 102, 241, ${0.12 + i * 0.02}) 0%, transparent 70%)`,
                        filter: 'blur(25px)',
                        animationDuration: `${5 + i}s`,
                    }}
                />
            ))}
        </div>
    );
};

// Grid Background - Data Visualization Theme
const GridBackground = () => {
    const bars = useMemo(() =>
        Array.from({ length: 12 }, (_, i) => ({
            height: 15 + Math.random() * 40,
            delay: i * 0.15,
        })), []
    );

    const linePoints = useMemo(() => {
        const points = [];
        for (let i = 0; i <= 10; i++) {
            points.push({
                x: 5 + i * 9,
                y: 55 + Math.sin(i * 0.7) * 15 + Math.random() * 8,
            });
        }
        return points;
    }, []);

    const dataDots = useMemo(() =>
        Array.from({ length: 25 }, (_, i) => ({
            x: 5 + Math.random() * 90,
            y: 10 + Math.random() * 80,
            size: 2 + Math.random() * 4,
            delay: Math.random() * 3,
            color: ['#6366f1', '#a855f7', '#3b82f6'][i % 3],
        })), []
    );

    // Pool of spawn positions - more variety
    const spawnPositions = useMemo(() => [
        { top: '8%', left: '12%' },
        { top: '8%', left: '50%' },
        { top: '8%', left: '85%' },
        { top: '15%', left: '25%' },
        { top: '15%', left: '70%' },
        { top: '22%', left: '8%' },
        { top: '22%', left: '55%' },
        { top: '28%', left: '35%' },
        { top: '28%', left: '82%' },
        { top: '38%', left: '15%' },
        { top: '38%', left: '65%' },
        { top: '45%', left: '45%' },
        { top: '45%', left: '88%' },
        { top: '55%', left: '10%' },
        { top: '55%', left: '75%' },
        { top: '65%', left: '30%' },
        { top: '65%', left: '85%' },
        { top: '75%', left: '12%' },
        { top: '75%', left: '55%' },
        { top: '82%', left: '40%' },
        { top: '82%', left: '78%' },
        { top: '90%', left: '20%' },
        { top: '90%', left: '65%' },
    ], []);

    // Stats with random position assignment
    const stats = useMemo(() => {
        const items = [
            { text: '+127%', color: 'text-indigo-400', size: 'text-5xl' },
            { text: '#1', color: 'text-violet-400', size: 'text-4xl' },
            { text: 'Top 3', color: 'text-blue-400', size: 'text-2xl' },
            { text: '★ 4.9', color: 'text-indigo-400', size: 'text-xl' },
            { text: '↑ 3.1K', color: 'text-purple-400', size: 'text-3xl' },
            { text: '↑ 1.7K', color: 'text-violet-400', size: 'text-2xl' },
            { text: '$4.2K', color: 'text-emerald-400', size: 'text-xl' },
            { text: '+89%', color: 'text-purple-300', size: 'text-2xl' },
            { text: 'Tier 1', color: 'text-cyan-400', size: 'text-xl' },
            { text: '+42%', color: 'text-blue-400', size: 'text-lg' },
        ];

        // Shuffle spawn positions
        const shuffled = [...spawnPositions].sort(() => Math.random() - 0.5);

        return items.map((item, i) => ({
            ...item,
            ...shuffled[i % shuffled.length],
            delay: `${i * 1.8}s`,
        }));
    }, [spawnPositions]);

    // Re-shuffle positions periodically
    const [positionSeed, setPositionSeed] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setPositionSeed(prev => prev + 1);
        }, 18000); // Match animation duration
        return () => clearInterval(interval);
    }, []);

    // Recalculate positions based on seed
    const currentStats = useMemo(() => {
        const shuffled = [...spawnPositions].sort(() => Math.random() - 0.5);
        return stats.map((stat, i) => ({
            ...stat,
            ...shuffled[(i + positionSeed) % shuffled.length],
        }));
    }, [positionSeed, spawnPositions, stats]);

    return (
        <div className="absolute inset-0 overflow-hidden bg-slate-950">
            {/* Subtle grid */}
            <div
                className="absolute inset-0 opacity-10"
                style={{
                    backgroundImage: `
                        linear-gradient(rgba(99, 102, 241, 0.5) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(99, 102, 241, 0.5) 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px',
                }}
            />

            {/* Bar chart at bottom */}
            <div className="absolute bottom-0 left-0 right-0 h-[45%] flex items-end justify-around px-[8%] opacity-25">
                {bars.map((bar, i) => (
                    <div
                        key={i}
                        className="w-[5%] rounded-t animate-pulse"
                        style={{
                            height: `${bar.height}%`,
                            background: 'linear-gradient(to top, rgba(99, 102, 241, 0.9), rgba(139, 92, 246, 0.3))',
                            animationDuration: '3s',
                            animationDelay: `${bar.delay}s`,
                        }}
                    />
                ))}
            </div>

            {/* Line chart SVG */}
            <svg className="absolute inset-0 w-full h-full opacity-20" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#6366f1" />
                        <stop offset="50%" stopColor="#a855f7" />
                        <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                </defs>
                <polyline
                    fill="none"
                    stroke="url(#lineGrad)"
                    strokeWidth="2"
                    points={linePoints.map(p => `${p.x}%,${p.y}%`).join(' ')}
                />
                {linePoints.map((p, i) => (
                    <circle
                        key={i}
                        cx={`${p.x}%`}
                        cy={`${p.y}%`}
                        r="5"
                        fill="#6366f1"
                        className="animate-pulse"
                        style={{ animationDelay: `${i * 0.2}s`, animationDuration: '2.5s' }}
                    />
                ))}
            </svg>

            {/* Scattered data dots */}
            {dataDots.map((dot, i) => (
                <div
                    key={i}
                    className="absolute rounded-full animate-pulse"
                    style={{
                        width: dot.size,
                        height: dot.size,
                        left: `${dot.x}%`,
                        top: `${dot.y}%`,
                        background: dot.color,
                        boxShadow: `0 0 ${dot.size * 3}px ${dot.color}`,
                        animationDelay: `${dot.delay}s`,
                        animationDuration: '2.5s',
                    }}
                />
            ))}

            {/* Floating statistics - Random spawn positions */}
            {currentStats.map((stat, i) => (
                <div
                    key={`${i}-${positionSeed}`}
                    className={`absolute font-black ${stat.color} ${stat.size}`}
                    style={{
                        top: stat.top,
                        left: stat.left,
                        animation: `float-fade 18s ease-in-out infinite`,
                        animationDelay: stat.delay,
                        opacity: 0,
                    }}
                >
                    {stat.text}
                </div>
            ))}

            {/* Fade overlays */}
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/20 via-transparent to-slate-950/70" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/40 via-transparent to-slate-950/40" />
        </div>
    );
};

export const LoginPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isAnimating, setIsAnimating] = useState(false);
    const [isReturningUser, setIsReturningUser] = useState(true);

    // Random background selection (25% each)
    const [bgStyle] = useState<BackgroundStyle>(() => {
        const randomIndex = Math.floor(Math.random() * BACKGROUND_STYLES.length);
        return BACKGROUND_STYLES[randomIndex];
    });

    // Random welcome back variation selection (20% each)
    const [welcomeBackVariation] = useState(() => {
        const randomIndex = Math.floor(Math.random() * WELCOME_BACK_VARIATIONS.length);
        return WELCOME_BACK_VARIATIONS[randomIndex];
    });

    // Check if returning user and set dark mode
    useEffect(() => {
        document.documentElement.classList.add('dark');

        // Check localStorage for previous visits
        const hasVisited = localStorage.getItem('aso_has_visited');
        if (!hasVisited) {
            setIsReturningUser(false);
            localStorage.setItem('aso_has_visited', 'true');
        }

        return () => {
            document.documentElement.classList.remove('dark');
        };
    }, []);

    // Get the correct welcome texts based on user type
    const welcomeTexts = isReturningUser ? welcomeBackVariation : WELCOME_TEXTS;

    useEffect(() => {
        const interval = setInterval(() => {
            setIsAnimating(true);
            setTimeout(() => {
                setCurrentIndex((prev) => (prev + 1) % welcomeTexts.length);
                setIsAnimating(false);
            }, 400);
        }, 3000);

        return () => clearInterval(interval);
    }, [welcomeTexts.length]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
        } catch (err: any) {
            setError(err.message || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    const currentWelcome = welcomeTexts[currentIndex];

    const renderBackground = () => {
        switch (bgStyle) {
            case 'aurora': return <AuroraBackground />;
            case 'mesh': return <MeshBackground />;
            case 'particles': return <ParticlesBackground />;
            case 'grid': return <GridBackground />;
            default: return <AuroraBackground />;
        }
    };

    return (
        <div className="min-h-[100dvh] relative flex items-center justify-center p-4">
            {renderBackground()}



            {/* Login Card */}
            <div className="max-w-md w-full bg-slate-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-800/50 overflow-hidden relative z-10">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/30">
                            <Lock className="text-white" size={32} />
                        </div>

                        <div className="h-10 flex items-center justify-center mb-2">
                            <h1
                                className={`text-2xl font-black text-white transition-all duration-500 ease-out ${isAnimating
                                    ? 'opacity-0 scale-95 blur-sm'
                                    : 'opacity-100 scale-100 blur-0'
                                    }`}
                                style={{
                                    direction: currentWelcome.lang === 'ar' ? 'rtl' : 'ltr'
                                }}
                            >
                                {currentWelcome.text}
                            </h1>
                        </div>

                        <p className="text-slate-400">Sign in to access your dashboard</p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 bg-red-900/20 border border-red-800 rounded-xl flex items-start gap-3">
                            <AlertCircle className="text-red-400 shrink-0 mt-0.5" size={18} />
                            <p className="text-sm text-red-400 font-medium">{error}</p>
                        </div>
                    )}

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-300 ml-1">Email</label>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-white font-medium"
                                    placeholder="name@company.com"
                                    autoComplete="email"
                                    required
                                />
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-bold text-slate-300 ml-1">Password</label>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-white font-medium"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    required
                                />
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-70 disabled:hover:scale-100 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </button>
                    </form>
                </div>
                <div className="p-4 bg-slate-800/30 border-t border-slate-800/50 text-center">
                    <p className="text-xs text-slate-400 font-medium">Protected by hawks • Жив, цел, орёл 🦅</p>
                </div>
            </div>
        </div>
    );
};
