document.addEventListener('DOMContentLoaded', () => {
    // --- SELETORES GERAIS CACHEADOS ---
    const dashboardBody = document.querySelector('.dashboard-body');
    const topBarImage = document.getElementById('topBarImage');
    const menuImage = document.getElementById('menuImage');
    const profileUpload = document.getElementById('profileUpload');
    const hamburgerMenu = document.getElementById('hamburgerMenu');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const topBarProfile = document.getElementById('topBarProfile');

    let currentQuestionData = {};

    // ===================================
    // FUNÇÕES DE UTILIDADE E AUXILIARES
    // ===================================

    const showFlashMessage = (message, type) => {
        const flashContainer = document.createElement('div');
        flashContainer.className = `flash-message ${type}`;
        flashContainer.textContent = message;
        const contentPanel = document.querySelector('.content-panel');
        if (contentPanel) {
            contentPanel.insertBefore(flashContainer, contentPanel.firstChild);
            setTimeout(() => {
                flashContainer.remove();
            }, 5000); // Remove a mensagem após 5 segundos
        }
    };

    const toggleMenu = () => {
        dashboardBody?.classList.toggle('menu-open');
        dropdownMenu?.classList.toggle('open');
        hamburgerMenu?.classList.toggle('open');
        topBarProfile?.classList.toggle('hidden');
    };

    // ===================================
    // MÓDULO: TEMA (CLARO/ESCURO)
    // ===================================
    const setupThemeToggler = () => {
        const themeToggleBtn = document.getElementById('theme-toggle-btn');
        const themeLink = document.getElementById('theme-link');

        if (!themeToggleBtn || !themeLink) return;

        const moonIconClass = 'fa-moon';
        const sunIconClass = 'fa-sun';

        const setTheme = (theme) => {
            const isDark = theme === 'dark';
            const themeHref = isDark ? "/static/css/tema_escuro.css" : "/static/css/tema_claro.css";
            const iconClass = isDark ? sunIconClass : moonIconClass;

            themeLink.setAttribute('href', themeHref);
            themeToggleBtn.innerHTML = `<i class="fas ${iconClass}"></i>`;
            document.body.classList.toggle('dark-theme', isDark);
            document.body.classList.toggle('light-theme', !isDark);
            localStorage.setItem('theme', theme);
        };

        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = localStorage.getItem('theme');
            setTheme(currentTheme === 'dark' ? 'light' : 'dark');
        });

        const savedTheme = localStorage.getItem('theme') || 'light';
        setTheme(savedTheme);
    };

    // ===================================
    // MÓDULO: LOGIN
    // ===================================
    const setupLoginForm = () => {
        const loginForm = document.getElementById('loginForm');
        if (!loginForm) return; // Só executa se encontrar o formulário de login

        const loginContainer = document.getElementById('loginContainer');
        const welcomeContainer = document.getElementById('welcomeContainer');
        const welcomeAvatar = document.getElementById('welcomeAvatar');
        const welcomeMessage = document.getElementById('welcomeMessage');
        const errorMessage = document.getElementById('errorMessage');
        const defaultAvatar = "/static/images/default-avatar.svg";

        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault(); // Impede o envio tradicional
            errorMessage.hidden = true;

            const formData = new FormData(loginForm);

            try {
                const response = await fetch(loginForm.action, {
                    method: 'POST',
                    body: new URLSearchParams(formData)
                });

                const data = await response.json();

                if (data.success) {
                    if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo, ${data.user.nome_completo}!`;
                    if (welcomeAvatar) welcomeAvatar.src = data.user.foto_perfil_url || defaultAvatar;
                    if (loginContainer) loginContainer.classList.add('animating');
                    if (welcomeContainer) welcomeContainer.hidden = false;

                    // CORREÇÃO: Acessar a URL de redirecionamento do objeto 'data'
                    setTimeout(() => {
                        // A URL vem do backend no objeto 'data'
                        window.location.href = data.redirect_url;
                    }, 2500);
                } else {
                    if (errorMessage) {
                        errorMessage.textContent = data.message;
                        errorMessage.hidden = false;
                    }
                }
            } catch (error) {
                console.error('Erro no login:', error);
                if (errorMessage) {
                    errorMessage.textContent = 'Ocorreu um erro de comunicação. Tente novamente.';
                    errorMessage.hidden = false;
                }
            }
        });
    };

    // ===================================
    // MÓDULO: UPLOAD DE FOTO
    // ===================================
    const setupProfilePhotoUpload = () => {
        if (!profileUpload) return;

        profileUpload.addEventListener('change', async (event) => {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64Image = e.target.result;
                if (topBarImage) topBarImage.src = base64Image;
                if (menuImage) menuImage.src = base64Image;

                try {
                    const res = await fetch('/upload_foto', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64Image }),
                    });
                    const data = await res.json();
                    if (data.success) {
                        location.reload();
                    } else {
                        showFlashMessage('Erro ao salvar a foto: ' + (data.error || 'Erro desconhecido'), 'error');
                    }
                } catch (error) {
                    showFlashMessage('Erro de conexão ao enviar a foto.', 'error');
                    console.error('Erro no upload de foto:', error);
                }
            };
            reader.readAsDataURL(file);
        });
    };

    // ===================================
    // MÓDULO: MENU LATERAL
    // ===================================
    const setupMenu = () => {
        hamburgerMenu?.addEventListener('click', (event) => {
            event.stopPropagation();
            toggleMenu();
        });

        document.addEventListener('click', (event) => {
            if (dropdownMenu?.classList.contains('open') &&
                !dropdownMenu.contains(event.target) &&
                !hamburgerMenu?.contains(event.target)) {
                toggleMenu();
            }
        });
    };

    // ===================================
    // MÓDULO: BUSCA INTERATIVA
    // ===================================
    const setupInteractiveSearch = () => {
        const searchWrapper = document.getElementById('searchWrapper');
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');
        const searchTermBubble = document.getElementById('searchTermBubble');
        const searchResultsContainer = document.getElementById('searchResultsContainer');
        const searchResultsList = document.getElementById('searchResultsList');

        const performSearch = async () => {
            if (!searchInput || !searchResultsContainer || !searchResultsList) return;

            const query = searchInput.value.trim();
            if (query.length < 2) {
                searchResultsContainer.style.display = 'none';
                searchTermBubble.style.display = 'none';
                return;
            }

            try {
                const response = await fetch(`/search_questoes?q=${encodeURIComponent(query)}`);
                if (!response.ok) throw new Error('Erro na busca.');
                const results = await response.json();

                searchTermBubble.innerHTML = `
                    <span class="term-text">Busca: "${query}"</span>
                    <a href="/questoes?q=${encodeURIComponent(query)}" class="view-all-link">Ver todos &rarr;</a>
                `;
                searchTermBubble.style.display = 'flex';
                searchInput.placeholder = '';

                searchResultsList.innerHTML = '';
                if (results.length > 0) {
                    results.forEach(questao => {
                        const tagsHTML = `
                            <span class="tag tag-${questao.nivel_dificuldade.toLowerCase()}">${questao.nivel_dificuldade.replace('_', ' ')}</span>
                            ${questao.grau_ensino ? `<span class="tag tag-grau">${questao.grau_ensino}</span>` : ''}
                        `;
                        searchResultsList.innerHTML += `
                            <div class="question-item" data-id="${questao.id}">
                                <div class="question-item-content">
                                    <p><strong>#${questao.id}:</strong> ${questao.enunciado}</p>
                                    <div class="question-tags">${tagsHTML}</div>
                                </div>
                            </div>
                        `;
                    });
                } else {
                    searchResultsList.innerHTML = `<p>Nenhum resultado rápido encontrado.</p>`;
                }
                searchResultsContainer.style.display = 'block';
                searchResultsContainer.classList.add('visible');
            } catch (error) {
                console.error('Erro ao realizar busca:', error);
                searchResultsList.innerHTML = `<p>Ocorreu um erro ao buscar. Tente novamente.</p>`;
                searchResultsContainer.style.display = 'block';
            }
        };

        searchBtn?.addEventListener('click', performSearch);
        searchInput?.addEventListener('keyup', (event) => {
            if (event.key === 'Enter') performSearch();
        });

        document.addEventListener('click', (event) => {
            if (searchWrapper && !searchWrapper.contains(event.target) && searchResultsContainer && !searchResultsContainer.contains(event.target)) {
                searchResultsContainer.style.display = 'none';
                searchTermBubble.style.display = 'none';
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.placeholder = 'Buscar por título, nível ou grau de ensino...';
                }
            }
        });
    };

    // ===================================
    // MÓDULO: FORMULÁRIO DINÂMICO
    // ===================================
    const setupQuestionForm = () => {
        const tipoQuestaoSelect = document.getElementById('tipo_questao');
        const optionsContainer = document.getElementById('optionsContainer');
        const addOptionBtn = document.getElementById('addOptionBtn');
        const addOptionWrapper = document.getElementById('addOptionWrapper');
        let optionCount = 0;

        const addOptionField = () => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionCount++;
            const questionType = tipoQuestaoSelect.value;
            const inputType = (questionType === 'ESCOLHA_UNICA') ? 'radio' : 'checkbox';
            const newOption = document.createElement('div');
            newOption.className = 'form-group dynamic-option';
            newOption.innerHTML = `
                <label for="opcao_texto_${optionCount}">Opção ${String.fromCharCode(64 + optionCount)}</label>
                <div class="option-input-group">
                    <input type="text" name="opcoes_texto[]" id="opcao_texto_${optionCount}" placeholder="Texto da opção" required>
                    <label class="correct-answer-label">
                        <input type="${inputType}" name="respostas_corretas[]" value="${optionCount - 1}">
                        <span>Correta?</span>
                    </label>
                    <button type="button" class="remove-option-btn">&times;</button>
                </div>
            `;
            optionsContainer.appendChild(newOption);
            newOption.querySelector('.remove-option-btn')?.addEventListener('click', () => newOption.remove());
        };

        const updateFormUI = () => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionsContainer.innerHTML = '';
            optionCount = 0;
            const questionType = tipoQuestaoSelect.value;
            if (questionType === 'DISCURSIVA') {
                if (addOptionWrapper) addOptionWrapper.style.display = 'none';
            } else {
                if (addOptionWrapper) addOptionWrapper.style.display = 'block';
                addOptionField();
                addOptionField();
            }
        };

        tipoQuestaoSelect?.addEventListener('change', updateFormUI);
        addOptionBtn?.addEventListener('click', addOptionField);
        if (tipoQuestaoSelect) {
            updateFormUI(); // Inicializa o formulário
        }
    };

    // ===================================
    // MÓDULO: SELEÇÃO E EXPORTAÇÃO
    // ===================================
    const setupSelectionAndExport = () => {
        const selectionActions = document.getElementById('selectionActions');
        const selectionCount = document.getElementById('selectionCount');
        const exportBtn = document.getElementById('exportBtn');
        const exportFormat = document.getElementById('exportFormat');
        const questionList = document.querySelector('.question-list');
        const selectedIds = new Set();

        const updateSelectionUI = () => {
            const count = selectedIds.size;
            if (selectionCount) selectionCount.textContent = `${count} questão${count !== 1 ? 's' : ''} selecionada${count !== 1 ? 's' : ''}`;
            if (selectionActions) {
                if (count > 0) {
                    selectionActions.classList.add('visible');
                } else {
                    selectionActions.classList.remove('visible');
                }
            }
        };

        questionList?.addEventListener('change', (event) => {
            const checkbox = event.target.closest('.question-checkbox');
            if (!checkbox) return;
            const id = checkbox.dataset.id;
            const questionItem = checkbox.closest('.question-item');
            if (checkbox.checked) {
                selectedIds.add(id);
                questionItem?.classList.add('selected');
            } else {
                selectedIds.delete(id);
                questionItem?.classList.remove('selected');
            }
            updateSelectionUI();
        });

        exportBtn?.addEventListener('click', async () => {
            if (selectedIds.size === 0) {
                alert('Selecione pelo menos uma questão para exportar.');
                return;
            }

            const format = exportFormat.value;
            const ids = Array.from(selectedIds);

            try {
                const response = await fetch('/export_questoes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: ids, format: format }),
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Falha na exportação');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const contentDisposition = response.headers.get('content-disposition');
                let filename = `questoes.${format}`;
                if (contentDisposition) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(contentDisposition);
                    if (matches?.[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } catch (error) {
                showFlashMessage(`Erro ao exportar: ${error.message}`, 'error');
            }
        });
    };

    // ===================================
    // MÓDULO: MODAL DE VISUALIZAÇÃO/EDIÇÃO
    // ===================================
    const setupQuestionModal = () => {
        const questionModalOverlay = document.getElementById('questionModalOverlay');
        const modalCloseBtn = document.getElementById('modalCloseBtn');
        const modalViewContent = document.getElementById('modalViewContent');
        const modalEditContent = document.getElementById('modalEditContent');
        const modalQuestionTitle = document.getElementById('modalQuestionTitle');
        const modalOptionsList = document.getElementById('modalOptionsList');
        const modalEditBtn = document.getElementById('modalEditBtn');
        const modalDeleteBtn = document.getElementById('modalDeleteBtn');
        const modalTags = document.getElementById('modalTags');

        const openModal = async (questionId) => {
            try {
                const response = await fetch(`/get_questao/${questionId}`);
                if (!response.ok) throw new Error('Falha ao buscar detalhes.');
                currentQuestionData = await response.json();

                switchToViewMode();
                if (modalQuestionTitle) modalQuestionTitle.textContent = `#${currentQuestionData.id}: ${currentQuestionData.enunciado}`;

                if (modalTags) {
                    modalTags.innerHTML = `
                        <span class="tag tag-${currentQuestionData.nivel_dificuldade.toLowerCase()}">${currentQuestionData.nivel_dificuldade.replace('_', ' ')}</span>
                        ${currentQuestionData.grau_ensino ? `<span class="tag tag-grau">${currentQuestionData.grau_ensino}</span>` : ''}
                    `;
                }

                if (modalOptionsList) {
                    modalOptionsList.innerHTML = '';
                    if (currentQuestionData.tipo_questao === 'DISCURSIVA') {
                        modalOptionsList.innerHTML = '<li>Questão discursiva não possui opções.</li>';
                    } else if (currentQuestionData.opcoes) {
                        currentQuestionData.opcoes.forEach(op => {
                            const li = document.createElement('li');
                            li.textContent = op.texto_opcao;
                            if (op.is_correta) li.classList.add('correct');
                            modalOptionsList.appendChild(li);
                        });
                    }
                }

                if (modalDeleteBtn) modalDeleteBtn.dataset.id = questionId;
                if (modalEditBtn) modalEditBtn.dataset.id = questionId;
                questionModalOverlay?.classList.add('open');
            } catch (error) {
                showFlashMessage(error.message, 'error');
            }
        };

        const closeModal = () => {
            questionModalOverlay?.classList.remove('open');
            setTimeout(switchToViewMode, 400); // Garante a transição visual
        };

        const switchToEditMode = () => {
            if (!modalViewContent || !modalEditContent) return;
            modalViewContent.style.display = 'none';
            modalEditContent.style.display = 'block';

            let optionsHTML = '';
            if (currentQuestionData.tipo_questao !== 'DISCURSIVA') {
                const inputType = currentQuestionData.tipo_questao === 'ESCOLHA_UNICA' ? 'radio' : 'checkbox';
                currentQuestionData.opcoes.forEach((opcao, index) => {
                    const isChecked = opcao.is_correta ? 'checked' : '';
                    const optionText = opcao.texto_opcao || '';
                    optionsHTML += `
                        <div class="form-group dynamic-option">
                            <div class="option-input-group">
                                <input type="text" name="opcoes_texto[]" value="${optionText}" required>
                                <label class="correct-answer-label">
                                    <input type="${inputType}" name="respostas_corretas[]" value="${index}" ${isChecked}>
                                    <span>Correta?</span>
                                </label>
                            </div>
                        </div>
                    `;
                });
            }

            modalEditContent.innerHTML = `
                <form id="editQuestionForm" action="/edit_questao/${currentQuestionData.id}" method="POST">
                    <div class="form-group">
                        <label>Enunciado</label>
                        <textarea name="enunciado" rows="4" required>${currentQuestionData.enunciado || ''}</textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Nível de Dificuldade</label>
                            <select name="nivel_dificuldade" required>
                                <option value="FACIL" ${currentQuestionData.nivel_dificuldade === 'FACIL' ? 'selected' : ''}>Fácil</option>
                                <option value="MEDIO" ${currentQuestionData.nivel_dificuldade === 'MEDIO' ? 'selected' : ''}>Médio</option>
                                <option value="DIFICIL" ${currentQuestionData.nivel_dificuldade === 'DIFICIL' ? 'selected' : ''}>Difícil</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Grau de Ensino</label>
                            <input type="text" name="grau_ensino" value="${currentQuestionData.grau_ensino || ''}" placeholder="Ex: Ensino Médio">
                        </div>
                    </div>
                    <input type="hidden" name="tipo_questao" value="${currentQuestionData.tipo_questao}">
                    ${optionsHTML}
                    <div class="modal-footer">
                        <button type="button" class="secondary-btn" id="cancelEditBtn">Cancelar</button>
                        <button type="submit" class="submit-btn">Salvar Alterações</button>
                    </div>
                </form>
            `;
            document.getElementById('cancelEditBtn')?.addEventListener('click', switchToViewMode);
        };

        const switchToViewMode = () => {
            if (!modalViewContent || !modalEditContent) return;
            modalViewContent.style.display = 'block';
            modalEditContent.style.display = 'none';
            modalEditContent.innerHTML = '';
        };

        const handleDeleteQuestion = async (questionId) => {
            if (!confirm(`Tem certeza que deseja mover a questão #${questionId} para a lixeira?`)) return;
            try {
                const response = await fetch(`/delete_questao/${questionId}`, { method: 'POST' });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Falha ao excluir.');
                location.reload();
            } catch (error) {
                showFlashMessage(error.message, 'error');
            }
        };

        document.body.addEventListener('click', async (event) => {
            const itemContent = event.target.closest('.question-item-content');
            if (itemContent) {
                const questionItem = itemContent.closest('.question-item');
                if (questionItem && questionItem.dataset.id && !event.target.closest('.selection-checkbox')) {
                    openModal(questionItem.dataset.id);
                }
            }

            const deleteBtn = event.target.closest('.delete-btn:not(.modal-delete-btn)');
            if (deleteBtn) {
                event.stopPropagation();
                handleDeleteQuestion(deleteBtn.dataset.id);
            }

            const restoreBtn = event.target.closest('.restore-btn');
            if (restoreBtn) {
                try {
                    const response = await fetch(`/restore_questao/${restoreBtn.dataset.id}`, { method: 'POST' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Falha ao restaurar.');
                    location.reload();
                } catch (error) {
                    showFlashMessage(error.message, 'error');
                }
            }

            const permDeleteBtn = event.target.closest('.perm-delete-btn');
            if (permDeleteBtn) {
                if (!confirm(`EXCLUSÃO PERMANENTE: Tem certeza que deseja apagar a questão #${permDeleteBtn.dataset.id} para sempre?`)) return;
                try {
                    const response = await fetch(`/delete_permanently/${permDeleteBtn.dataset.id}`, { method: 'POST' });
                    const data = await response.json();
                    if (!response.ok) throw new Error(data.error || 'Falha ao excluir permanentemente.');
                    location.reload();
                } catch (error) {
                    showFlashMessage(error.message, 'error');
                }
            }
        });

        modalEditBtn?.addEventListener('click', switchToEditMode);
        modalDeleteBtn?.addEventListener('click', () => {
            if (modalDeleteBtn.dataset.id) {
                handleDeleteQuestion(modalDeleteBtn.dataset.id);
                closeModal();
            }
        });
        modalCloseBtn?.addEventListener('click', closeModal);
        questionModalOverlay?.addEventListener('click', e => {
            if (e.target === questionModalOverlay) closeModal();
        });
    };

    // ===================================
    // INICIALIZAÇÃO DE TODOS OS MÓDULOS
    // ===================================
    setupThemeToggler();
    setupLoginForm();
    setupProfilePhotoUpload();
    setupMenu();
    setupInteractiveSearch();
    setupQuestionForm();
    setupSelectionAndExport();
    setupQuestionModal();
});
