class BranchAccessMixin:
    """
    Mixin mágico que filtra los datos automáticamente:
    1. Si es Superusuario o Admin SIN sede -> Ve todo.
    2. Si tiene Sede asignada -> Solo ve datos de su sede.
    """

    def get_queryset(self):
        # 1. Obtenemos la consulta original del ViewSet (ej. Sale.objects.all())
        queryset = super().get_queryset()
        user = self.request.user

        # A) Si no está logueado, no ve nada (por seguridad)
        if not user.is_authenticated:
            return queryset.none()

        # B) Si es Superusuario o Admin Global (sin branch asignada)
        # Ellos pueden filtrar por URL ?branch_id=X, si no filtran ven todo.
        if user.is_superuser or (user.role == "ADMIN" and not user.branch):
            return queryset

        # C) Si el usuario tiene una Sede asignada (Sea Admin de Sede o Empleado)
        if user.branch:
            # Forzamos el filtro. Aunque pidan otra sede, solo verán la suya.
            return queryset.filter(branch=user.branch)

        # Fallback de seguridad
        return queryset.none()

    def perform_create(self, serializer):
        """
        Al crear un dato (ej. una Venta), se asigna automáticamente
        a la sede del usuario si este tiene una.
        """
        user = self.request.user
        if user.branch:
            serializer.save(branch=user.branch)
        else:
            serializer.save()
