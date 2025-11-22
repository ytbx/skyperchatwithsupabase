/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		extend: {
			colors: {
				primary: {
					50: '#eff6ff',
					100: '#dbeafe',
					500: '#3b82f6',
					700: '#1d4ed8',
					900: '#1e3a8a',
				},
				neutral: {
					0: '#000000',
					50: '#0a0a0a',
					100: '#141414',
					200: '#1e1e1e',
					400: '#525252',
					600: '#9ca3af',
					800: '#d1d5db',
					900: '#f9fafb',
				},
				bg: {
					app: '#000000',
					panel: '#0a0a0a',
				},
				success: '#22c55e',
				warning: '#f59e0b',
				error: '#ef4444',
				info: '#3b82f6',
			},
			fontFamily: {
				sans: ['Inter', 'sans-serif'],
				mono: ['JetBrains Mono', 'monospace'],
			},
			fontSize: {
				xs: '0.75rem',
				sm: '0.875rem',
				base: '1rem',
				lg: '1.125rem',
				xl: '1.25rem',
				'2xl': '1.5rem',
				'3xl': '1.875rem',
				'4xl': '2.25rem',
			},
			fontWeight: {
				normal: '400',
				medium: '500',
				semibold: '600',
				bold: '700',
			},
			lineHeight: {
				tight: '1.25',
				normal: '1.5',
				relaxed: '1.75',
			},
			spacing: {
				1: '4px',
				2: '8px',
				3: '12px',
				4: '16px',
				6: '24px',
				8: '32px',
				12: '48px',
				16: '64px',
				24: '96px',
			},
			borderRadius: {
				sm: '4px',
				DEFAULT: '8px',
				md: '12px',
				lg: '16px',
				xl: '24px',
				full: '9999px',
			},
			boxShadow: {
				'glow-sm': '0 0 10px rgba(59, 130, 246, 0.3)',
				'glow': '0 0 20px rgba(59, 130, 246, 0.4)',
				'glow-lg': '0 0 30px rgba(59, 130, 246, 0.5)',
				'card': '0 2px 8px rgba(0, 0, 0, 0.4)',
			},
			animation: {
				'fade-in': 'fadeIn 150ms ease-out',
				'slide-up': 'slideUp 250ms ease-out',
				'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
			},
			keyframes: {
				fadeIn: {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' },
				},
				slideUp: {
					'0%': { transform: 'translateY(10px)', opacity: '0' },
					'100%': { transform: 'translateY(0)', opacity: '1' },
				},
			},
			transitionDuration: {
				fast: '150ms',
				normal: '250ms',
				slow: '400ms',
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}
