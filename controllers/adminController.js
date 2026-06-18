const bcrypt = require("bcryptjs");
const User = require("../models/User");
const audit = require("../services/auditService");

const OWNER_EMAIL = "abdulrahman4463810@gmail.com";
const ROLES = ["user", "admin", "superadmin"];

function normalizeRole(role) {
  const value = String(role || "user").replace("super_admin", "superadmin").toLowerCase();
  return ROLES.includes(value) ? value : "user";
}

function safeUser(user) {
  const obj = user.toObject ? user.toObject() : user;
  delete obj.password;
  return obj;
}

exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select("-password").sort({ role: 1, name: 1 });
    res.json(users);
  } catch (e) { next(e); }
};

exports.createUser = async (req, res, next) => {
  try {
    const { name, email, password, role, department, phone, securityAnswer } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required" });
    const exists = await User.findOne({ email: String(email).toLowerCase() });
    if (exists) return res.status(400).json({ message: "Email already exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: String(email).toLowerCase(),
      password: hash,
      role: normalizeRole(role),
      department: department || "",
      phone: phone || "",
      securityAnswer: String(securityAnswer || "").toLowerCase(),
    });
    await audit(req, "CREATE", "USER", { id: user._id, email: user.email, role: user.role });
    res.status(201).json(safeUser(user));
  } catch (e) { next(e); }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id || req.body.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isOwner = user.email === OWNER_EMAIL;
    const { name, email, role, department, phone, password, securityAnswer } = req.body;

    if (name !== undefined) user.name = name;
    if (department !== undefined) user.department = department;
    if (phone !== undefined) user.phone = phone;
    if (securityAnswer !== undefined) user.securityAnswer = String(securityAnswer || "").toLowerCase();

    if (email !== undefined && !isOwner) user.email = String(email).toLowerCase();
    if (role !== undefined) {
      const nextRole = normalizeRole(role);
      user.role = isOwner ? "superadmin" : nextRole;
    }
    if (password) user.password = await bcrypt.hash(password, 10);

    await user.save();
    await audit(req, "UPDATE", "USER", { id: user._id, email: user.email, role: user.role });
    res.json(safeUser(user));
  } catch (e) { next(e); }
};

exports.changeRole = async (req, res, next) => {
  try {
    const user = await User.findById(req.body.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === OWNER_EMAIL) return res.status(400).json({ message: "Owner super admin role cannot be changed" });
    user.role = normalizeRole(req.body.role);
    await user.save();
    await audit(req, "ROLE_CHANGE", "USER", { id: user._id, email: user.email, role: user.role });
    res.json({ message: "Role updated successfully", user: safeUser(user) });
  } catch (e) { next(e); }
};

exports.deleteUser = async (req, res, next) => {
  try {
    const id = req.params.id || req.body.userId;
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.email === OWNER_EMAIL) return res.status(400).json({ message: "Owner super admin cannot be deleted" });
    await User.findByIdAndDelete(id);
    await audit(req, "DELETE", "USER", { id, email: user.email });
    res.json({ message: "User deleted" });
  } catch (e) { next(e); }
};
