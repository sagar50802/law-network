import isOwner from "../../utils/isOwner";

export default function IfOwnerOnly({ children, className = '' }) {
  if (!isOwner()) return null;
  return <div className={className}>{children}</div>;
}
