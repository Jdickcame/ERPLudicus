import { Mail, Pencil, Shield, Trash2, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../../api/axios";
import BranchSelector from "../../components/common/BranchSelector";
import { useBranch } from "../../context/BranchContext";
import type { User } from "../../types";
import UserForm from "./UserForm";

const UserList = () => {
  const { currentBranch } = useBranch();
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 👇 NUEVO ESTADO: Usuario seleccionado para editar
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const loadUsers = async () => {
    if (!currentBranch) return;
    try {
      const res = await api.get(`/users/users/?branch_id=${currentBranch.id}`);
      setUsers(Array.isArray(res.data) ? res.data : res.data.results);
    } catch (error) {
      console.error("Error cargando usuarios", error);
    }
  };

  useEffect(() => {
    if (currentBranch) loadUsers();
  }, [currentBranch]);

  // 👇 Función para abrir el modal en MODO CREAR
  const handleCreate = () => {
    setEditingUser(null); // Limpiamos selección
    setIsModalOpen(true);
  };

  // 👇 Función para abrir el modal en MODO EDITAR
  const handleEdit = (user: User) => {
    setEditingUser(user); // Guardamos al usuario seleccionado
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("¿Estás seguro de eliminar este usuario?")) return;
    try {
      await api.delete(`/users/users/${id}/`);
      loadUsers();
    } catch (error) {
      alert("No se pudo eliminar el usuario");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Users className="text-blue-600" /> Gestión de Usuarios
            </h1>
            <BranchSelector />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Personal asignado a <strong>{currentBranch?.name || "..."}</strong>
          </p>
        </div>

        <button
          onClick={handleCreate} // Usamos la nueva función
          className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition shadow-lg shadow-blue-200"
        >
          <UserPlus size={20} /> Nuevo Usuario
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {users.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-300">
            <Users size={48} className="mx-auto mb-2 opacity-20" />
            <p>No hay usuarios registrados en esta sede.</p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex flex-col gap-4 hover:shadow-md transition relative group"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 font-bold text-xl uppercase">
                  {user.username[0]}
                </div>
                <div>
                  <h3 className="font-bold text-slate-800">
                    {user.first_name} {user.last_name}
                  </h3>
                  <p className="text-xs text-slate-500">@{user.username}</p>
                </div>
              </div>

              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex items-center gap-2">
                  <Mail size={16} className="text-slate-400" />
                  {user.email}
                </div>
                <div className="flex items-center gap-2">
                  <Shield size={16} className="text-slate-400" />
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-semibold ${
                      user.role === "ADMIN"
                        ? "bg-purple-100 text-purple-700"
                        : user.role === "MANAGER"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                {/* 👇 BOTÓN EDITAR */}
                <button
                  onClick={() => handleEdit(user)}
                  className="text-orange-400 hover:text-orange-600 p-2 hover:bg-orange-50 rounded-lg transition"
                  title="Editar Usuario"
                >
                  <Pencil size={18} />
                </button>

                {/* BOTÓN ELIMINAR */}
                <button
                  onClick={() => handleDelete(user.id)}
                  className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition"
                  title="Eliminar Usuario"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <UserForm
            onClose={() => setIsModalOpen(false)}
            onSuccess={loadUsers}
            userToEdit={editingUser} // 👈 Pasamos el usuario a editar (puede ser null)
          />
        </div>
      )}
    </div>
  );
};

export default UserList;
