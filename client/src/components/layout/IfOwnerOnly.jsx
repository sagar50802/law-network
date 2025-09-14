import isOwner from '../../utils/isOwner';

const IfOwnerOnly = ({ children }) => {
  if (isOwner()) {
    return children;
  }
  return null;
};

export default IfOwnerOnly;