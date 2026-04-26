import { createContext, useContext } from 'react'

interface NightModeCtx { night: boolean; toggle: () => void }
export const NightModeContext = createContext<NightModeCtx>({ night: false, toggle: () => {} })
export const useNightModeCtx = () => useContext(NightModeContext)
