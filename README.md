# Alarabi Inventory

A mobile-friendly starter inventory and quotation app built with **Vite + React + TypeScript**.
It runs as a static web app, so it can be deployed to Cloudflare Pages. This starter stores data in the current browser using `localStorage`; it does **not** yet sync between devices or users.

## Features
- Dashboard with product counts and inventory value
- Product list with search, add, edit, and delete
- Stock quantity and low-stock indicators
- Quotations: create a quote from products, calculate totals, and print/save as PDF from the browser
- Arabic RTL interface
- Responsive layout for mobile and desktop
- Demo data on first launch

## Requirements
- Node.js 20.19+ or 22.12+
- npm

## Run locally
```bash
npm install
npm run dev
```
Open the local URL shown in your terminal.

## Build
```bash
npm run build
npm run preview
```

## Deploy to Cloudflare Pages
1. Upload this project to a GitHub repository.
2. In Cloudflare Dashboard, open **Workers & Pages** and create a Pages project connected to the GitHub repo.
3. Build command: `npm run build`
4. Build output directory: `dist`
5. Deploy.

## Important limitations
- Data is stored in the browser on one device and browser profile only.
- This is a starter app, not a secure multi-user production inventory system.
- Before real business use, add authentication, a server-side database, backups, and access control (e.g. Cloudflare Workers + D1).
