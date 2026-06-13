import { createContext, useContext, useState, type ReactNode } from "react";
import { SignInModal } from "./SignInModal";
import { SignUpModal } from "./SignUpModal";

interface AuthModalContextType {
  closeModal: () => void;
  openSignIn: () => void;
  openSignUp: () => void;
  isSignInOpen: boolean;
  isSignUpOpen: boolean;
}

const AuthModalContext = createContext<AuthModalContextType>({
  closeModal: () => {},
  openSignIn: () => {}, openSignUp: () => {},
  isSignInOpen: false, isSignUpOpen: false,
});

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const [isSignInOpen, setSignInOpen] = useState(false);
  const [isSignUpOpen, setSignUpOpen] = useState(false);

  const openSignIn = () => { setSignUpOpen(false); setSignInOpen(true); };
  const openSignUp = () => { setSignInOpen(false); setSignUpOpen(true); };
  const closeModal = () => { setSignInOpen(false); setSignUpOpen(false); };

  return (
    <AuthModalContext.Provider value={{
      closeModal,
      openSignIn, openSignUp,
      isSignInOpen, isSignUpOpen,
    }}>
      {children}
      <SignInModal isOpen={isSignInOpen} onClose={closeModal} onSwitchToSignUp={openSignUp} />
      <SignUpModal isOpen={isSignUpOpen} onClose={closeModal} onSwitchToSignIn={openSignIn} />
    </AuthModalContext.Provider>
  );
}

export const useAuthModal = () => useContext(AuthModalContext);
export default AuthModalContext;
