import UpdateToast from "./UpdateToast";

// Point de montage unique pour les composants PWA globaux (toast de mise à
// jour ici ; la capture d'installation de la Tâche 6 s'y ajoute).
export default function PwaBoot() {
  return <UpdateToast />;
}
