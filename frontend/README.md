# posArg — frontend

PWA de caja: React 19 + TypeScript + Vite + Tailwind, con cola offline en IndexedDB e impresión
térmica ESC/POS por WebUSB / Web Bluetooth.

La documentación del proyecto está en el [README de la raíz](../README.md).

```bash
npm install
npm run dev     # http://localhost:5173 (proxy /api → http://localhost:8080)
npm run build   # tsc -b && vite build
npm run lint
```
