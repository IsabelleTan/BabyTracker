# Frontend Dependency Analysis

## Summary

The core stack (React, Vite, TypeScript, Tailwind, React Router, Recharts) is load-bearing and worth keeping. Analysis below covers the remaining dependencies.

## Dependency Audit

### axios — REPLACEABLE
- **Usage**: Single import location (`src/lib/api.ts`)
- **Features Used**: `axios.create()` with `baseURL: '/api'`, request interceptor (token injection), response interceptor (401 redirect)
- **API calls across app**: ~13 calls in 6 files (`api.get`, `api.post`, `api.delete`)
- **Assessment**: Native `fetch` with a ~25-line wrapper covers all of this. No advanced features (retries, timeouts, transforms) used.

### clsx + tailwind-merge — REPLACEABLE
- **Pattern**: Always used together via `cn()` in `src/lib/utils.ts`
- **Files using `cn()`**: 3 UI component files only (`button.tsx`, `alert-dialog.tsx`, `drawer.tsx`)
- **Assessment**: Can be replaced with a small inline merge function. The main value of `tailwind-merge` is deduplicating conflicting Tailwind classes; this happens in a handful of places.

### class-variance-authority (CVA) — REPLACEABLE
- **Usage**: 1 file, 1 component (`src/components/ui/button.tsx`)
- **What it does**: Variant/size matrix for the Button component (6 sizes × 6 styles)
- **Assessment**: Replaceable with a plain object lookup + conditional classnames in ~15 lines.

### tw-animate-css — REPLACEABLE
- **Usage**: Imported once in `index.css`; 6 animation class names used in source (`animate-spin`, `animate-in`, `fade-in-0`, `animate-out`, `fade-out-0`, `zoom-in-95`, `zoom-out-95`)
- **Assessment**: Tailwind v4 supports `@keyframes` natively; these can be inlined in a few lines of CSS.

### idb — KEEP
- **Usage**: Single location (`src/lib/db.ts`) for pending events queue
- **Assessment**: Raw IndexedDB API is genuinely painful; the simplification is proportional to its size.

### vaul — KEEP
- **Usage**: 1 file (`src/components/ui/drawer.tsx`) — bottom sheet drawer primitive
- **Assessment**: Gesture/swipe handling is non-trivial to build correctly.

### @base-ui/react — KEEP
- **Components used**: `@base-ui/react/button` and `@base-ui/react/alert-dialog`
- **Assessment**: Provides accessibility primitives (focus trapping, ARIA) for AlertDialog. Button primitive is trivially replaceable but the AlertDialog is not.

### lucide-react — KEEP
- **Usage**: 29 unique icons across 9 files
- **Assessment**: Tree-shakeable; not worth replacing.

### recharts — KEEP
- **Usage**: 1 file (`src/pages/Stats.tsx`), 3 chart types, 7 chart components imported
- **Assessment**: Switching is a full rewrite; provides real axis/tooltip/responsive container value.

### react-router-dom — KEEP
- **Usage**: 7 files, basic API only (`BrowserRouter`, `Routes`, `Route`, `Navigate`, `NavLink`, `useNavigate`)
- **Assessment**: Core infrastructure; fundamental to the app.

### react-is — N/A
- **Usage**: 0 direct imports in app code — transitive dependency of `@base-ui/react`

## Completed

- [x] Replace `axios` with native `fetch`
- [x] Drop `clsx` + `tailwind-merge` + `class-variance-authority`
- [x] Replace `tw-animate-css` with native Tailwind v4 animations
