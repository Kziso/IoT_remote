import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/m/', // build assumes app served from http://host/m/
  plugins: [react()],
})
