import React, { createContext, useContext } from 'react';
import { User } from 'firebase/auth';

interface AppContextValue {
  user: User | null;
  familyId: string | null;
}

const AppContext = createContext<AppContextValue>({ user: null, familyId: null });

export const AppContextProvider = AppContext.Provider;

export function useAppContext(): AppContextValue {
  return useContext(AppContext);
}
