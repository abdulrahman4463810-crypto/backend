const { ensureOwnerSuperAdmin, OWNER_ACCOUNT } = require("./utils/ownerAccount");

async function seedAdmin() {
  const user = await ensureOwnerSuperAdmin();
  console.log("Owner super admin ready:", OWNER_ACCOUNT.email, "role:", user.role);
}

module.exports = seedAdmin;
