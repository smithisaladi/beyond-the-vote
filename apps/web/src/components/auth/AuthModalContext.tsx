import { createContext, useContext, useState, type ReactNode } from "react";
import { SignInModal } from "./SignInModal";
import { SignUpModal } from "./SignUpModal";

interface AuthModalContextType {
  showSignIn: () => void;
  showSignUp: () => void;
  closeModal: () => void;
  openSignIn: () => void;
  openSignUp: () => void;
  isSignInOpen: boolean;
  isSignUpOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType>({
  showSignIn: () => {}, showSignUp: () => {}, closeModal: () => {},
  openSignIn: () => {}, openSignUp: () => {},
  isSignInOpen: false, isSignUpOpen: false,
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isSignInOpen, setSignInOpen] = useState(false);
  const [isSignUpOpen, setSignUpOpen] = useState(false);

  const showSignIn = () => { setSignUpOpen(false); setSignInOpen(true); };
  const showSignUp = () => { setSignInOpen(false); setSignUpOpen(true); };
  const closeModal = () => { setSignInOpen(false); setSignUpOpen(false); };

  return (
    <AuthModalContext.Provider value={{
      showSignIn, showSignUp, closeModal,
      openSignIn: showSignIn, openSignUp: showSignUp,
      isSignInOpen, isSignUpOpen,
    }}>
      {children}
      <SignInModal isOpen={isSignInOpen} onClose={closeModal} onSwitchToSignUp={showSignUp} />
      <SignUpModal isOpen={isSignUpOpen} onClose={closeModal} onSwitchToSignIn={showSignIn} />
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
export default AuthModalContext;
