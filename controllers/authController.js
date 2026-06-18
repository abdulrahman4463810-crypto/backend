const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { isOwnerEmail, restoreOwnerOnLogin } = require("../utils/ownerAccount");

function sign(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role, name: user.name },
    process.env.JWT_SECRET || "dev_secret",
    { expiresIn: "7d" }
  );
}

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, bestFriend, department, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required" });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Email already exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hash,
      role: "user",
      department: department || "",
      phone: phone || "",
      securityAnswer: (bestFriend || "").toLowerCase(),
    });
    res.status(201).json({ message: "Account created", user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (e) { next(e); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || "").trim().toLowerCase();
    let user = await User.findOne({ email: normalizedEmail });

    // Permanent owner restore: if the owner account was deleted from DB,
    // logging in with the fixed owner credentials will recreate it as superadmin.
    if (!user) {
      user = await restoreOwnerOnLogin(normalizedEmail, password);
    }
    if (!user) return res.status(400).json({ message: "Invalid email or password" });

    let ok = await bcrypt.compare(password, user.password);

    // If owner password hash was damaged/changed outside the app, allow the
    // fixed owner credential once and reset the hash safely.
    if (!ok && isOwnerEmail(normalizedEmail)) {
      user = await restoreOwnerOnLogin(normalizedEmail, password);
      ok = Boolean(user);
    }

    if (!ok) return res.status(400).json({ message: "Invalid email or password" });

    // Owner must always remain superadmin even if role was changed manually in DB.
    if (isOwnerEmail(user.email) && (user.role !== "superadmin" || !user.isOwner)) {
      user.role = "superadmin";
      user.isOwner = true;
      await user.save();
    }

    res.json({
      token: sign(user),
      user: { id: user._id, name: user.name, email: user.email, role: user.role, department: user.department, phone: user.phone, isOwner: user.isOwner }
    });
  } catch (e) { next(e); }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email, answer, newPassword } = req.body;
    const user = await User.findOne({ email: String(email).toLowerCase() });
    if (!user || String(user.securityAnswer || "").toLowerCase() !== String(answer || "").toLowerCase()) {
      return res.status(400).json({ message: "Invalid email or security answer" });
    }
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (e) { next(e); }
};

exports.profile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (e) { next(e); }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const updates = (({ name, department, phone }) => ({ name, department, phone }))(req.body);
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select("-password");
    res.json({ message: "Profile updated", user });
  } catch (e) { next(e); }
};

exports.changePassword = async (req, res, next) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    if (newPassword !== confirmPassword) return res.status(400).json({ message: "New password and confirm password do not match" });
    const user = await User.findById(req.user.id);
    const ok = await bcrypt.compare(oldPassword, user.password);
    if (!ok) return res.status(400).json({ message: "Old password is incorrect" });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: "Password changed successfully" });
  } catch (e) { next(e); }
};
