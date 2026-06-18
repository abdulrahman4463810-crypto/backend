const bcrypt = require("bcryptjs");
const User = require("../models/User");

const OWNER_ACCOUNT = {
  name: "Abdul Rahman",
  email: "abdulrahman4463810@gmail.com",
  password: "Sakb123456@",
  role: "superadmin",
  securityAnswer: "best friend",
};

function isOwnerEmail(email) {
  return String(email || "").trim().toLowerCase() === OWNER_ACCOUNT.email;
}

async function ownerSafeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department,
    phone: user.phone,
    isOwner: user.isOwner,
  };
}

async function ensureOwnerSuperAdmin(options = {}) {
  const { resetPassword = false } = options;
  const hash = await bcrypt.hash(OWNER_ACCOUNT.password, 10);
  let user = await User.findOne({ email: OWNER_ACCOUNT.email });

  if (!user) {
    user = await User.create({
      name: OWNER_ACCOUNT.name,
      email: OWNER_ACCOUNT.email,
      password: hash,
      role: OWNER_ACCOUNT.role,
      securityAnswer: OWNER_ACCOUNT.securityAnswer,
      isOwner: true,
    });
    return user;
  }

  let changed = false;
  if (user.role !== OWNER_ACCOUNT.role) {
    user.role = OWNER_ACCOUNT.role;
    changed = true;
  }
  if (!user.isOwner) {
    user.isOwner = true;
    changed = true;
  }
  if (!user.name) {
    user.name = OWNER_ACCOUNT.name;
    changed = true;
  }
  if (resetPassword) {
    user.password = hash;
    changed = true;
  }
  if (changed) await user.save();
  return user;
}

async function restoreOwnerOnLogin(email, password) {
  if (!isOwnerEmail(email)) return null;
  if (String(password || "") !== OWNER_ACCOUNT.password) return null;
  return ensureOwnerSuperAdmin({ resetPassword: true });
}

module.exports = {
  OWNER_ACCOUNT,
  isOwnerEmail,
  ownerSafeUser,
  ensureOwnerSuperAdmin,
  restoreOwnerOnLogin,
};
