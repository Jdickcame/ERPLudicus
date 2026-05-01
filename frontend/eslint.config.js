import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    // 👇 AQUÍ ES DONDE RELAJAMOS LAS REGLAS 👇
    rules: {
      ...reactHooks.configs.recommended.rules,
      
      // Permitir 'any' sin errores rojos
      '@typescript-eslint/no-explicit-any': 'off',
      
      // Permitir useEffect sin todas las dependencias (muy común)
      'react-hooks/exhaustive-deps': 'off',
      
      // Permitir variables declaradas pero no usadas (opcional, para limpieza)
      '@typescript-eslint/no-unused-vars': 'off',

      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
)