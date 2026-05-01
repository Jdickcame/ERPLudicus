import { Check, Pencil, Shield, X } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import { useBranch } from "../../context/BranchContext";
import type { User } from "../../types";

interface UserFormProps {
  onClose: () => void;
  onSuccess: () => void;
  userToEdit?: User | null;
}

const UserForm = ({ onClose, onSuccess, userToEdit }: UserFormProps) => {
  const { currentBranch } = useBranch();
  const [loading, setLoading] = useState(false);

  // Estados iniciales del formulario
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "", // En edición, vacío significa "no cambiar"
    first_name: "",
    last_name: "",
    role: "EMPLOYEE",
  });

  // 👇 ESTADO DE PERMISOS GRANULARES
  // Deben coincidir con los campos de tu modelo y serializer en Django
  const [permissions, setPermissions] = useState({
    // Admin
    can_view_users: false,

    // Ventas
    can_view_pos: false,
    can_view_sales_list: false,

    // Inventario
    can_view_products_list: false,
    can_view_products_create: false,

    // Compras
    can_view_purchases_create: false,
    can_view_purchases_list: false,
    can_view_purchases_payable: false,
    can_view_purchases_balances: false,
    can_view_purchases_suppliers: false,
    can_view_purchases_budgets: false,
  });

  // 👇 EFECTO: Si llega un usuario para editar, rellenamos los campos
  useEffect(() => {
    if (userToEdit) {
      setFormData({
        username: userToEdit.username,
        email: userToEdit.email,
        password: "", // No mostramos la contraseña encriptada
        first_name: userToEdit.first_name,
        last_name: userToEdit.last_name,
        role: userToEdit.role,
      });

      // Mapeamos los permisos que vienen de la BD
      // Usamos "|| false" por si el valor viene null o undefined
      setPermissions({
        can_view_users: userToEdit.can_view_users || false,

        can_view_pos: userToEdit.can_view_pos || false,
        can_view_sales_list: userToEdit.can_view_sales_list || false,

        can_view_products_list: userToEdit.can_view_products_list || false,
        can_view_products_create: userToEdit.can_view_products_create || false,

        can_view_purchases_create:
          userToEdit.can_view_purchases_create || false,
        can_view_purchases_list: userToEdit.can_view_purchases_list || false,
        can_view_purchases_payable:
          userToEdit.can_view_purchases_payable || false,
        can_view_purchases_balances:
          userToEdit.can_view_purchases_balances || false,
        can_view_purchases_suppliers:
          userToEdit.can_view_purchases_suppliers || false,
        can_view_purchases_budgets:
          userToEdit.can_view_purchases_budgets || false,
      });
    }
  }, [userToEdit]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handlePermissionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPermissions({ ...permissions, [e.target.name]: e.target.checked });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBranch) return alert("Error: No hay sede seleccionada");

    setLoading(true);
    try {
      // Preparamos los datos
      const payload: any = {
        ...formData,
        ...permissions, // Enviamos todos los flags
        branch: currentBranch.id,
      };

      // Si la contraseña está vacía en modo edición, la quitamos del payload
      if (userToEdit && !payload.password) {
        delete payload.password;
      }

      if (userToEdit) {
        // 🟡 MODO EDICIÓN (PATCH)
        await api.patch(`/users/users/${userToEdit.id}/`, payload);
        alert("Usuario actualizado correctamente");
      } else {
        // 🟢 MODO CREACIÓN (POST)
        await api.post("/users/users/", payload);
        alert(`Usuario creado en ${currentBranch.name}`);
      }

      onSuccess();
      onClose();
    } catch (error) {
      console.error(error);
      alert("Error al guardar. Verifica los datos y que el usuario no exista.");
    } finally {
      setLoading(false);
    }
  };

  const isEditing = !!userToEdit;

  return (
    <div className="bg-white rounded-xl p-6 w-full max-w-4xl shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          {isEditing ? (
            <Pencil className="text-orange-500" />
          ) : (
            <Shield className="text-blue-600" />
          )}
          {isEditing ? "Editar Usuario" : "Registrar Nuevo Usuario"}
        </h2>
        <button onClick={onClose} className="text-slate-400 hover:text-red-500">
          <X size={24} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. DATOS PERSONALES */}
        <div className="grid grid-cols-2 gap-4">
          <input
            name="first_name"
            placeholder="Nombre"
            required
            className="border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
            onChange={handleChange}
            value={formData.first_name}
          />
          <input
            name="last_name"
            placeholder="Apellido"
            required
            className="border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500"
            onChange={handleChange}
            value={formData.last_name}
          />
        </div>

        {/* 2. CREDENCIALES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <input
            name="username"
            placeholder="Usuario (Login)"
            required
            className="border p-2 rounded w-full"
            onChange={handleChange}
            value={formData.username}
          />
          <input
            name="email"
            type="email"
            placeholder="Correo Electrónico"
            required
            className="border p-2 rounded w-full"
            onChange={handleChange}
            value={formData.email}
          />
          <input
            name="password"
            type="password"
            required={!isEditing}
            placeholder={
              isEditing ? "Nueva Contraseña (Opcional)" : "Contraseña"
            }
            className="border p-2 rounded w-full"
            onChange={handleChange}
            value={formData.password}
          />
          <select
            name="role"
            className="border p-2 rounded w-full bg-white"
            onChange={handleChange}
            value={formData.role}
          >
            <option value="EMPLOYEE">Empleado</option>
            <option value="MANAGER">Gerente</option>
            <option value="ADMIN">Administrador</option>
          </select>
        </div>

        {/* 3. PERMISOS GRANULARES (Solo visible si NO es Admin) */}
        {formData.role !== "ADMIN" && (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
            <h3 className="text-sm font-bold text-slate-800 uppercase mb-4 border-b pb-2">
              Permisos Detallados
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* BLOQUE: VENTAS */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-blue-600 uppercase flex items-center gap-1">
                  🛒 Ventas
                </p>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-blue-50 transition">
                  <input
                    type="checkbox"
                    name="can_view_pos"
                    checked={permissions.can_view_pos}
                    onChange={handlePermissionChange}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    Punto de Venta (POS)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-blue-50 transition">
                  <input
                    type="checkbox"
                    name="can_view_sales_list"
                    checked={permissions.can_view_sales_list}
                    onChange={handlePermissionChange}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-slate-700">
                    Historial Ventas
                  </span>
                </label>
              </div>

              {/* BLOQUE: INVENTARIO */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-purple-600 uppercase flex items-center gap-1">
                  📦 Inventario
                </p>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-purple-50 transition">
                  <input
                    type="checkbox"
                    name="can_view_products_list"
                    checked={permissions.can_view_products_list}
                    onChange={handlePermissionChange}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-700">Ver Productos</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-purple-50 transition">
                  <input
                    type="checkbox"
                    name="can_view_products_create"
                    checked={permissions.can_view_products_create}
                    onChange={handlePermissionChange}
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-slate-700">
                    Crear/Editar Productos
                  </span>
                </label>
              </div>

              {/* BLOQUE: USUARIOS */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1">
                  👥 Admin
                </p>
                <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-slate-100 transition">
                  <input
                    type="checkbox"
                    name="can_view_users"
                    checked={permissions.can_view_users}
                    onChange={handlePermissionChange}
                    className="rounded text-slate-600 focus:ring-slate-500"
                  />
                  <span className="text-sm text-slate-700">
                    Gestionar Usuarios
                  </span>
                </label>
              </div>

              {/* BLOQUE: COMPRAS (Expandido) */}
              <div className="col-span-full mt-2 pt-4 border-t border-slate-200">
                <p className="text-xs font-bold text-orange-600 uppercase mb-3 flex items-center gap-1">
                  🛍️ Compras y Proveedores
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-orange-50 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_create"
                      checked={permissions.can_view_purchases_create}
                      onChange={handlePermissionChange}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-slate-700">Nueva Compra</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-orange-50 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_list"
                      checked={permissions.can_view_purchases_list}
                      onChange={handlePermissionChange}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-slate-700">Historial</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-orange-50 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_suppliers"
                      checked={permissions.can_view_purchases_suppliers}
                      onChange={handlePermissionChange}
                      className="rounded text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-sm text-slate-700">Proveedores</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-red-50 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_payable"
                      checked={permissions.can_view_purchases_payable}
                      onChange={handlePermissionChange}
                      className="rounded text-red-500 focus:ring-red-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Cuentas x Pagar
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-green-50 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_balances"
                      checked={permissions.can_view_purchases_balances}
                      onChange={handlePermissionChange}
                      className="rounded text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      Saldos a Favor
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer bg-white p-2 rounded border border-slate-100 hover:bg-slate-100 transition">
                    <input
                      type="checkbox"
                      name="can_view_purchases_budgets"
                      checked={permissions.can_view_purchases_budgets}
                      onChange={handlePermissionChange}
                      className="rounded text-slate-500 focus:ring-slate-500"
                    />
                    <span className="text-sm text-slate-700">Presupuestos</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* BOTONES */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded transition"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className={`px-6 py-2 text-white rounded font-medium transition flex items-center gap-2 ${
              isEditing
                ? "bg-orange-500 hover:bg-orange-600"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {loading ? (
              "Guardando..."
            ) : (
              <>
                <Check size={18} />{" "}
                {isEditing ? "Actualizar Usuario" : "Crear Usuario"}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default UserForm;
