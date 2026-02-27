/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
      },
      colors: {
        space: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c0d2ff',
          300: '#93afff',
          400: '#6080ff',
          500: '#3d55f5',
          600: '#2c3de8',
          700: '#2331cc',
          800: '#1e29a5',
          900: '#1a2382',
          950: '#050814',
        },
        void: '#030508',
        nebula: '#0a0f1e',
      },
      animation: {
        'spin-slow': 'spin 20s linear infinite',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'orbit': 'orbit 8s linear infinite',
        'asteroid': 'asteroid 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
        'impact': 'impact 0.6s ease-out forwards',
        'shockwave': 'shockwave 0.8s ease-out forwards',
        'star-twinkle': 'starTwinkle 3s ease-in-out infinite',
        'flow': 'flow 2s linear infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        orbit: {
          from: { transform: 'rotate(0deg) translateX(40px) rotate(0deg)' },
          to: { transform: 'rotate(360deg) translateX(40px) rotate(-360deg)' },
        },
        impact: {
          '0%': { transform: 'scale(1)' },
          '30%': { transform: 'scale(1.2)', filter: 'brightness(2)' },
          '60%': { transform: 'scale(0.95)' },
          '100%': { transform: 'scale(1.04)' },
        },
        shockwave: {
          '0%': { transform: 'scale(0.5)', opacity: '1' },
          '100%': { transform: 'scale(2.5)', opacity: '0' },
        },
        starTwinkle: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.3' },
        },
        flow: {
          from: { strokeDashoffset: '20' },
          to: { strokeDashoffset: '0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}
