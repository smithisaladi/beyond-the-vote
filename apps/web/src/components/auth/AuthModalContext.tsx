import { createContext, useContext, useState, type ReactNode } from "react";

interface AuthModalContextType {
  showSignIn: () => void;
  showSignUp: () => void;
  closeModal: () => void;
  isSignInOpen: boolean;
  isSignUpOpen: boolean;
  openSignIn: () => void;
  openSignUp: () => void;
}

const AuthModalContext = createContext<AuthModalContextType>({
  showSignIn: () => {},
  showSignUp: () => {},
  closeModal: () => {},
  isSignInOpen: false,
  isSignUpOpen: false,
  openSignIn: () => {},
  openSignUp: () => {},
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isSignInOpen, setSignInOpen] = useState(false);
  const [isSignUpOpen, setSignUpOpen] = useState(false);

  const showSignIn = () => { setSignUpOpen(false); setSignInOpen(true); };
  const showSignUp = () => { setSignInOpen(false); setSignUpOpen(true); };
  const closeModal = () => { setSignInOpen(false); setSignUpOpen(false); };

  return (
    <AuthModalContext.Provider value={{
      showSignIn,
      showSignUp,
      closeModal,
      isSignInOpen,
      isSignUpOpen,
      openSignIn: showSignIn,
      openSignUp: showSignUp,
    }}>
      {children}
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
export default AuthModalContext;
