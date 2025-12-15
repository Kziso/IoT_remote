import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/pc/', // served under http://host/pc/
  plugins: [react()],
})
