// client/src/components/common/AdminRoute.jsx
import { Navigate } from "react-router-dom";
import isOwner from "../../utils/isOwner";

export default function AdminRoute({ children }) {
  return isOwner() ? children : <Navigate to="/admin/login" replace />;
}
