/**
 * French interface text, keyed by the English sentence it replaces.
 * Anything absent falls back to English, so this file can grow safely.
 */
export const FRENCH: Record<string, string> = {
  // Navigation and shell -----------------------------------------------------
  Overview: "Vue d'ensemble",
  Operations: "Opérations",
  Administration: "Administration",
  Oversight: "Supervision",
  Dashboard: "Tableau de bord",
  Ledger: "Grand livre",
  "Forex Bureau": "Bureau de change",
  "Mobile Money": "Mobile money",
  "Cash & Float": "Caisse et float",
  Customers: "Clients",
  Employees: "Employés",
  "Expenses & Finance": "Dépenses et finances",
  Reports: "Rapports",
  "Audit Trail": "Piste d'audit",
  Settings: "Paramètres",
  "Sign in": "Se connecter",
  "Sign out": "Se déconnecter",
  "Forex & Mobile Money": "Change et mobile money",
  Navigation: "Navigation",
  "Open menu": "Ouvrir le menu",
  "Search pages": "Rechercher une page",
  "Search pages…": "Rechercher une page…",
  "No page matches “{query}”.": "Aucune page ne correspond à « {query} ».",
  "Not signed in": "Non connecté",
  Staff: "Personnel",
  Language: "Langue",
  "Light theme": "Thème clair",
  "Dark theme": "Thème sombre",
  "Loading your workspace…": "Chargement de votre espace…",
  "Sign in to FinDesk": "Connectez-vous à FinDesk",
  "Staff access only. Sign in with the account your administrator created.":
    "Accès réservé au personnel. Connectez-vous avec le compte créé par votre administrateur.",

  // Sign-in screen -----------------------------------------------------------
  "Use your staff account.": "Utilisez votre compte personnel.",
  Email: "Adresse e-mail",
  Password: "Mot de passe",
  "Signing in…": "Connexion…",
  "Forex Bureau and Mobile Money agency operations, on one ledger.":
    "Les opérations de bureau de change et d'agence mobile money, sur un seul grand livre.",
  "Kampala · Uganda": "Kampala · Ouganda",
  "Staff accounts are issued by your company administrator. Roles and branch access are granted after your first sign-in.":
    "Les comptes du personnel sont créés par l'administrateur de votre entreprise. Les rôles et l'accès aux agences sont attribués après votre première connexion.",
  "Check your details and try again.": "Vérifiez vos informations et réessayez.",
  "Sign-in failed. Try again.": "Échec de la connexion. Réessayez.",
  "Forgot your password?": "Mot de passe oublié ?",
  "Reset your password": "Réinitialiser votre mot de passe",
  "We will email you a link to set a new one.":
    "Nous vous enverrons un lien pour en définir un nouveau.",
  "Send reset link": "Envoyer le lien",
  "Sending…": "Envoi…",
  "If an account exists for that email, a reset link is on its way.":
    "Si un compte existe pour cette adresse, un lien de réinitialisation est en route.",
  "Back to sign in": "Retour à la connexion",
  "Set a new password": "Définir un nouveau mot de passe",
  "New password": "Nouveau mot de passe",
  "Confirm new password": "Confirmer le nouveau mot de passe",
  "Passwords do not match.": "Les mots de passe ne correspondent pas.",
  "Use at least 8 characters.": "Utilisez au moins 8 caractères.",
  "Save password": "Enregistrer le mot de passe",
  "Saving…": "Enregistrement…",
  "Checking your link…": "Vérification de votre lien…",
  "That reset link has expired.": "Ce lien de réinitialisation a expiré.",
  "That reset link has expired. Request a new one.":
    "Ce lien de réinitialisation a expiré. Demandez-en un nouveau.",
  "Request a new one from the sign-in screen.":
    "Demandez-en un nouveau depuis l'écran de connexion.",
  "Request a new link": "Demander un nouveau lien",
  "Your password has been changed.": "Votre mot de passe a été modifié.",
  "Go to the dashboard": "Aller au tableau de bord",
  "Could not save the new password.": "Impossible d'enregistrer le nouveau mot de passe.",
  "Choose a password you have not used here before.":
    "Choisissez un mot de passe que vous n'avez jamais utilisé ici.",
  "Use a password with at least 8 characters.": "Utilisez un mot de passe d'au moins 8 caractères.",
  "Sign in to {app}": "Connectez-vous à {app}",

  // Branding ----------------------------------------------------------------
  Branding: "Image de marque",
  "Name, logo and theme colour": "Nom, logo et couleur du thème",
  "Website name": "Nom du site",
  "Shown in the sidebar, the sign-in screen and the browser tab.":
    "Affiché dans la barre latérale, l'écran de connexion et l'onglet du navigateur.",
  Logo: "Logo",
  "Upload logo": "Téléverser un logo",
  "Uploading…": "Téléversement…",
  "Remove logo": "Retirer le logo",
  "PNG, JPEG or WebP, up to 2 MB. A square image looks best.":
    "PNG, JPEG ou WebP, jusqu'à 2 Mo. Une image carrée rend mieux.",
  "Brand colour": "Couleur de la marque",
  Custom: "Personnalisée",
  "Custom brand colour": "Couleur de marque personnalisée",
  Sample: "Aperçu",
  "Save branding": "Enregistrer l'image de marque",
  "Logo uploaded. Save branding to publish it.":
    "Logo téléversé. Enregistrez l'image de marque pour le publier.",
  "Could not upload the logo.": "Impossible de téléverser le logo.",
  "Buttons, links, the active menu item and charts follow this colour. Text contrast is chosen automatically.":
    "Les boutons, les liens, l'élément de menu actif et les graphiques suivent cette couleur. Le contraste du texte est choisi automatiquement.",

  // Shared components --------------------------------------------------------
  "Planned next": "Prochaines étapes",
  "One database step is still needed": "Une étape de base de données est encore nécessaire",
  "In Supabase open": "Dans Supabase, ouvrez",
  "paste the contents of": "collez le contenu de",
  "from the repository, run it, then press Try again here.":
    "du dépôt, exécutez-le, puis appuyez sur Réessayer ici.",
  "Try again": "Réessayer",
  "Planned · Phase {phase}": "Prévu · Phase {phase}",
  "Planned capabilities": "Fonctionnalités prévues",
  "This module is restricted": "Ce module est restreint",
  "Your current roles do not include access to this module. Ask a super admin or the company owner to review your roles.":
    "Vos rôles actuels ne donnent pas accès à ce module. Demandez à un super administrateur ou au propriétaire de l'entreprise de revoir vos rôles.",
  "This module is not yet operational. No transactions can be recorded here until its phase is delivered on top of the accounting ledger.":
    "Ce module n'est pas encore opérationnel. Aucune opération ne peut y être enregistrée tant que sa phase n'est pas livrée au-dessus du grand livre comptable.",

  // Error and not-found screens ---------------------------------------------
  "Page not found": "Page introuvable",
  "The page you're looking for doesn't exist or has been moved.":
    "La page que vous cherchez n'existe pas ou a été déplacée.",
  "Go home": "Retour à l'accueil",
  "This page didn't load": "Cette page n'a pas pu se charger",
  "Something went wrong on our end. You can try refreshing or head back home.":
    "Une erreur est survenue de notre côté. Actualisez la page ou revenez à l'accueil.",

  // Dashboard ---------------------------------------------------------------
  "Welcome back, {name}!": "Bon retour, {name} !",
  "Welcome back!": "Bon retour !",
  "Loading the ledger…": "Chargement du grand livre…",
  "Loading ledger balances…": "Chargement des soldes du grand livre…",
  "Company-wide position.": "Situation de l'ensemble de l'entreprise.",
  "Balances unavailable": "Soldes indisponibles",
  "Could not read ledger balances:": "Impossible de lire les soldes du grand livre :",
  "unknown error": "erreur inconnue",
  "It is the best time to manage your finances.": "C'est le bon moment pour gérer vos finances.",
  Refresh: "Actualiser",
  "Refreshing…": "Actualisation…",
  "Total assets": "Total de l'actif",
  "Everything the company owns, all branches": "Tout ce que l'entreprise possède, toutes agences",
  Income: "Produits",
  Expense: "Charges",
  "vs last month": "par rapport au mois dernier",
  "Net profit": "Résultat net",
  "Loss this month": "Perte ce mois-ci",
  "Income less expenses": "Produits moins charges",
  "No transactions posted yet": "Aucune opération enregistrée pour l'instant",
  "The ledger is empty, so every figure here is zero. Nothing on this page is simulated or estimated.":
    "Le grand livre est vide, donc tous les chiffres affichés sont nuls. Rien sur cette page n'est simulé ni estimé.",
  "Figures appear as soon as you record your first transaction: an expense or income, a forex trade, or a mobile money entry.":
    "Les chiffres apparaissent dès que vous enregistrez votre première opération : une dépense ou un produit, une opération de change ou une opération mobile money.",
  "Money flow": "Flux de trésorerie",
  "Expense mix": "Répartition des charges",
  "No expenses recorded yet.": "Aucune charge enregistrée pour l'instant.",
  "Total expense": "Total des charges",
  "Recent transactions": "Opérations récentes",
  "No journal entries have been posted yet.": "Aucune écriture n'a encore été comptabilisée.",
  Date: "Date",
  Description: "Description",
  Amount: "Montant",
  "No cash accounts found.": "Aucun compte de caisse trouvé.",
  "Account balances with movement": "Soldes des comptes avec mouvements",
  Code: "Code",
  Account: "Compte",
  Type: "Type",
  Balance: "Solde",
  "Balances are derived from immutable journal entries; nothing is edited in place. Postings recorded manually are never shown as network-verified.":
    "Les soldes proviennent d'écritures comptables immuables ; rien n'est modifié sur place. Les écritures saisies manuellement ne sont jamais présentées comme vérifiées par le réseau.",

  // Sign-in brand panel ------------------------------------------------------
  "Everything, on one ledger.": "Tout, sur un seul grand livre.",
  "Cash, float and foreign currency recorded once and reconciled by the books.":
    "Caisse, float et devises saisies une fois, puis rapprochées par la comptabilité.",
  "What you keep in one place": "Ce que vous suivez au même endroit",
  Cash: "Caisse",
  Float: "Float",
  Forex: "Change",
  "Show password": "Afficher le mot de passe",
  "Hide password": "Masquer le mot de passe",

  // Page headers ------------------------------------------------------------
  "Buy and sell foreign currency.": "Achetez et vendez des devises.",
  "Buy and sell foreign currency and manage exchange rates.":
    "Achetez et vendez des devises et gérez les taux de change.",
  "Record mobile money agency deposits and withdrawals.":
    "Enregistrez les dépôts et retraits de l'agence mobile money.",
  "Record agency deposits and withdrawals. Network references are entered by staff, never verified with the network.":
    "Enregistrez les dépôts et retraits de l'agence. Les références réseau sont saisies par le personnel, jamais vérifiées auprès du réseau.",
  "Tills, safes, mobile money float and reconciliation.":
    "Caisses, coffres, float mobile money et rapprochement.",
  "Chart of accounts, trial balance and posted journal entries.":
    "Plan comptable, balance générale et écritures comptabilisées.",
  "Read-only view of the chart of accounts, trial balance and posted entries.":
    "Vue en lecture seule du plan comptable, de la balance générale et des écritures comptabilisées.",
  "Ledger-reconciled operational and financial reports.":
    "Rapports opérationnels et financiers rapprochés avec le grand livre.",
  "Financial figures come from posted journal lines. Forex and mobile money totals cover the latest 200 records in the period.":
    "Les chiffres financiers proviennent des lignes comptabilisées. Les totaux de change et de mobile money portent sur les 200 derniers enregistrements de la période.",
  "Record expenses and income and read the ledgers.":
    "Enregistrez les dépenses et les produits et consultez les grands livres.",
  "Every expense and income posts a balanced journal entry against the chart of accounts.":
    "Chaque dépense et chaque produit génère une écriture équilibrée dans le plan comptable.",
  "Customer records, identification and history.": "Fiches clients, identification et historique.",
  "Customer records, identification and home branch. Records are deactivated, never deleted.":
    "Fiches clients, identification et agence de rattachement. Les fiches sont désactivées, jamais supprimées.",
  "Staff accounts, roles and access.": "Comptes du personnel, rôles et accès.",
  "Accounts, roles and access. Everyone works in {branch}.":
    "Comptes, rôles et accès. Tout le monde travaille à {branch}.",
  "Who changed what, and when.": "Qui a changé quoi, et quand.",
  "Every change is recorded automatically and cannot be edited.":
    "Chaque modification est enregistrée automatiquement et ne peut pas être modifiée.",
  "Company profile, currencies and permissions.": "Profil de l'entreprise, devises et permissions.",
  "Company profile, currencies, receipt format and the role permission matrix.":
    "Profil de l'entreprise, devises, format du reçu et matrice des permissions.",

  // Restricted-access panels ------------------------------------------------
  "Forex trading is restricted": "Le change est restreint",
  "Forex trading is available to staff with forex permissions. Ask a super admin or the company owner to review your roles.":
    "Le change est ouvert au personnel disposant des permissions de change. Demandez à un super administrateur ou au propriétaire de l'entreprise de revoir vos rôles.",
  "Customers are restricted": "Les clients sont restreints",
  "Customer records are available to customer-facing roles. Ask a super admin or the company owner to review your roles.":
    "Les fiches clients sont accessibles aux rôles en contact avec la clientèle. Demandez à un super administrateur ou au propriétaire de l'entreprise de revoir vos rôles.",
  "Employee management is restricted": "La gestion des employés est restreinte",
  "Only a super admin or the company owner can manage employee accounts.":
    "Seul un super administrateur ou le propriétaire de l'entreprise peut gérer les comptes du personnel.",
  "The audit trail is restricted": "La piste d'audit est restreinte",
  "Oversight roles can read the audit trail. Ask a super admin or the company owner for access.":
    "Les rôles de supervision peuvent consulter la piste d'audit. Demandez l'accès à un super administrateur ou au propriétaire de l'entreprise.",
  "Settings are restricted": "Les paramètres sont restreints",
  "Sign in to read company settings. Only super admins and the company owner can change them.":
    "Connectez-vous pour consulter les paramètres de l'entreprise. Seuls les super administrateurs et le propriétaire de l'entreprise peuvent les modifier.",

  // Section titles -----------------------------------------------------------
  "Recent activity": "Activité récente",
  "Cash positions": "Positions de caisse",
  "Branch net movement": "Mouvement net par agence",
  "Recent cash postings": "Écritures de caisse récentes",
  "Staff directory": "Annuaire du personnel",
  "Spend by category": "Dépenses par catégorie",
  "Ledger unavailable": "Grand livre indisponible",
  "Account history": "Historique du compte",
  "Recent journal lines": "Lignes comptables récentes",
  "Reporting period": "Période de reporting",
  "Income statement": "Compte de résultat",
  Expenses: "Charges",
  "Forex operations": "Opérations de change",
  "Mobile money operations": "Opérations mobile money",
  "Branch performance breakdown": "Détail des performances par agence",
  "Teller performance breakdown": "Détail des performances par caissier",
  "Cash reconciliation report": "Rapport de rapprochement de caisse",
  "Settings unavailable": "Paramètres indisponibles",
  "Receipts and reporting": "Reçus et rapports",
  "Currencies & rates": "Devises et taux",
  Trades: "Opérations",
  "Mobile money networks": "Réseaux mobile money",
};
