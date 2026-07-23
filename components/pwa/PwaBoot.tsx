import InstallPromptCapture from "./InstallPromptCapture";
import UpdateToast from "./UpdateToast";

// Point de montage unique pour les composants PWA globaux : capture de
// l'installation (invisible) + toast de mise à jour (visible).
export default function PwaBoot() {
  return (
    <>
      <InstallPromptCapture />
      <UpdateToast />
    </>
  );
}
