/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cyber: {
          bg: '#0F172A',
          card: '#1E293B',
          darker: '#020617',
          yellow: '#FFD400',
          yellowGlow: 'rgba(255, 212, 0, 0.2)',
          border: '#334155'
        }
      },
      boxShadow: {
        'glow-yellow': '0 0 15px rgba(255, 212, 0, 0.15)',
        'glow-danger': '0 0 15px rgba(239, 68, 68, 0.3)',
        'glow-success': '0 0 15px rgba(34, 197, 94, 0.2)',
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ripple': 'ripple 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
        'sos-blink': 'sosBlink 1s infinite alternate',
      },
      keyframes: {
        ripple: {
          '0%': { transform: 'scale(0.95)', opacity: '0.8' },
          '50%': { opacity: '0.5' },
          '100%': { transform: 'scale(2)', opacity: '0' },
        },
        sosBlink: {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.4)', boxShadow: '0 0 0px rgba(239, 68, 68, 0)' },
          '100%': { backgroundColor: 'rgba(239, 68, 68, 1)', boxShadow: '0 0 25px rgba(239, 68, 68, 0.8)' }
        }
      }
    },
  },
  plugins: [],
}
