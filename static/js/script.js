document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DE DESTAQUE AO CARREGAR A PÁGINA ---
    if (window.location.hash && window.location.hash.startsWith('#questao-')) {
        const questionId = window.location.hash;
        const questionElement = document.querySelector(questionId);
        if (questionElement) {
            questionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            questionElement.classList.add('highlight');
            setTimeout(() => {
                questionElement.classList.remove('highlight');
            }, 2000); // Duração da animação
        }
    }

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
            }, 5000);
        } else {
            alert(`${type.toUpperCase()}: ${message}`);
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
        const moonIconClass = 'fa-moon', sunIconClass = 'fa-sun';
        const setTheme = (theme) => {
            const isDark = theme === 'dark';
            themeLink.setAttribute('href', isDark ? "/static/css/tema_escuro.css" : "/static/css/tema_claro.css");
            themeToggleBtn.innerHTML = `<i class="fas ${isDark ? sunIconClass : moonIconClass}"></i>`;
            document.body.classList.toggle('dark-theme', isDark);
            document.body.classList.toggle('light-theme', !isDark);
            localStorage.setItem('theme', theme);
        };
        themeToggleBtn.addEventListener('click', () => setTheme(localStorage.getItem('theme') === 'dark' ? 'light' : 'dark'));
        setTheme(localStorage.getItem('theme') || 'light');
    };

    // ===================================
    // MÓDULO: LOGIN
    // ===================================
    const setupLoginForm = () => {
        const loginForm = document.getElementById('loginForm');
        if (!loginForm) return;
        const loginContainer = document.getElementById('loginContainer'), welcomeContainer = document.getElementById('welcomeContainer'), welcomeAvatar = document.getElementById('welcomeAvatar'), welcomeMessage = document.getElementById('welcomeMessage'), errorMessage = document.getElementById('errorMessage'), defaultAvatar = "/static/images/default-avatar.svg";
        loginForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            errorMessage.hidden = true;
            try {
                const response = await fetch(loginForm.action, { method: 'POST', body: new URLSearchParams(new FormData(loginForm)) });
                const data = await response.json();
                if (data.success) {
                    if (welcomeMessage) welcomeMessage.textContent = `Bem-vindo, ${data.user.nome_completo}!`;
                    if (welcomeAvatar) welcomeAvatar.src = data.user.foto_perfil_url || defaultAvatar;
                    loginContainer?.classList.add('animating');
                    if (welcomeContainer) welcomeContainer.hidden = false;
                    setTimeout(() => window.location.href = data.redirect_url, 2500);
                } else {
                    if (errorMessage) { errorMessage.textContent = data.message; errorMessage.hidden = false; }
                }
            } catch (error) {
                console.error('Erro no login:', error);
                if (errorMessage) { errorMessage.textContent = 'Ocorreu um erro de comunicação. Tente novamente.'; errorMessage.hidden = false; }
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
                    const res = await fetch('/upload_foto', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64Image }) });
                    const data = await res.json();
                    if (data.success) { location.reload(); }
                    else { showFlashMessage('Erro ao salvar a foto: ' + (data.error || 'Erro desconhecido'), 'error'); }
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
        hamburgerMenu?.addEventListener('click', (event) => { event.stopPropagation(); toggleMenu(); });
        document.addEventListener('click', (event) => {
            if (dropdownMenu?.classList.contains('open') && !dropdownMenu.contains(event.target) && !hamburgerMenu?.contains(event.target)) {
                toggleMenu();
            }
        });
    };

    // ===================================
    // MÓDULO: BUSCA INTERATIVA
    // ===================================
    const setupInteractiveSearch = () => {
        const searchWrapper = document.getElementById('searchWrapper'), searchInput = document.getElementById('searchInput'), searchBtn = document.getElementById('searchBtn'), searchTermBubble = document.getElementById('searchTermBubble'), searchResultsContainer = document.getElementById('searchResultsContainer'), searchResultsList = document.getElementById('searchResultsList');

        searchWrapper?.addEventListener('click', (event) => {
            if (!searchWrapper.classList.contains('expanded')) {
                searchWrapper.classList.add('expanded');
                searchInput?.focus();
            }
        });

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
                searchTermBubble.innerHTML = `<span class="term-text">Busca: "${query}"</span><a href="/banco_questoes?q=${encodeURIComponent(query)}" class="view-all-link">Ver todos &rarr;</a>`;
                searchTermBubble.style.display = 'flex';
                searchInput.placeholder = '';
                searchResultsList.innerHTML = '';
                if (results.length > 0) {
                    results.forEach(questao => {
                        const tagsHTML = `<span class="tag tag-${questao.nivel_dificuldade.toLowerCase()}">${questao.nivel_dificuldade.replace('_', ' ')}</span>` +
                                       `${questao.grau_ensino ? `<span class="tag tag-grau">${questao.grau_ensino}</span>` : ''}` +
                                       `${questao.area_conhecimento ? `<span class="tag tag-area">${questao.area_conhecimento}</span>` : ''}`;

                        searchResultsList.innerHTML += `<div class="question-item" data-id="${questao.id}" data-context="search-result"><div class="question-item-content"><p><strong>#${questao.id}:</strong> ${questao.enunciado}</p><div class="question-tags">${tagsHTML}</div></div></div>`;
                    });
                } else { searchResultsList.innerHTML = `<p>Nenhum resultado rápido encontrado.</p>`; }
                searchResultsContainer.style.display = 'block';
                searchResultsContainer.classList.add('visible');
            } catch (error) {
                console.error('Erro ao realizar busca:', error);
                searchResultsList.innerHTML = `<p>Ocorreu um erro ao buscar. Tente novamente.</p>`;
                searchResultsContainer.style.display = 'block';
            }
        };
        searchBtn?.addEventListener('click', performSearch);
        searchInput?.addEventListener('keyup', (event) => { if (event.key === 'Enter') performSearch(); });

        document.addEventListener('click', (event) => {
            if (searchWrapper && !searchWrapper.contains(event.target) && searchResultsContainer && !searchResultsContainer.contains(event.target)) {
                searchResultsContainer.style.display = 'none';
                searchTermBubble.style.display = 'none';
                searchWrapper.classList.remove('expanded');
                if (searchInput) { searchInput.value = ''; searchInput.placeholder = 'Buscar por título, nível, grau ou área...'; }
            }
        });
    };

    // ===================================
    // MÓDULO: FORMULÁRIO DINÂMICO
    // ===================================
    const setupQuestionForm = () => {
        const tipoQuestaoSelect = document.getElementById('tipo_questao'), optionsContainer = document.getElementById('optionsContainer'), addOptionBtn = document.getElementById('addOptionBtn'), addOptionWrapper = document.getElementById('addOptionWrapper'), generateWithAIBtn = document.getElementById('generateWithAIBtn'), enunciadoInput = document.getElementById('enunciado'), nivelDificuldadeSelect = document.getElementById('nivel_dificuldade'), grauEnsinoSelect = document.getElementById('grau_ensino');
        const imagemInput = document.getElementById('imagem');
        const imagePreviewContainer = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const addQuestionForm = document.querySelector('.question-form');

        // Listener para pré-visualização da imagem
        imagemInput?.addEventListener('change', function() {
            const file = this.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    previewImg.src = e.target.result;
                    imagePreviewContainer.style.display = 'block';
                }
                reader.readAsDataURL(file);
            } else {
                imagePreviewContainer.style.display = 'none';
                previewImg.src = '#';
            }
        });

        // Altera o tipo de submissão para suportar FormData (com arquivos)
        addQuestionForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(addQuestionForm);

            try {
                const response = await fetch(addQuestionForm.action, {
                    method: 'POST',
                    body: formData,
                });

                const html = await response.text();
                const newDoc = new DOMParser().parseFromString(html, 'text/html');
                const flashMessage = newDoc.querySelector('.flash-message');
                if (flashMessage) {
                    showFlashMessage(flashMessage.textContent, flashMessage.classList.contains('success') ? 'success' : 'error');
                }

                if (response.ok) {
                    window.location.href = newDoc.URL;
                }
            } catch (error) {
                console.error("Erro ao enviar formulário:", error);
                showFlashMessage('Erro de conexão. Tente novamente.', 'error');
            }
        });

        let optionCount = 0;
        const addOptionField = (text = '', isCorrect = false, imageUrl = '') => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionCount++;
            const inputType = (tipoQuestaoSelect.value === 'ESCOLHA_UNICA') ? 'radio' : 'checkbox';
            const newOption = document.createElement('div');
            newOption.className = 'form-group dynamic-option';
            newOption.innerHTML = `
                <label for="opcao_texto_${optionCount}">Opção ${String.fromCharCode(64 + optionCount)}</label>
                <div class="option-input-group">
                    <input type="text" name="opcoes_texto[]" id="opcao_texto_${optionCount}" placeholder="Texto da opção" value="${text}" required>
                    <label class="correct-answer-label">
                        <input type="${inputType}" name="respostas_corretas[]" value="${optionCount - 1}" ${isCorrect ? 'checked' : ''}>
                        <span>Correta?</span>
                    </label>
                    <button type="button" class="remove-option-btn">&times;</button>
                </div>
                <div class="option-image-group">
                    <label>
                        Imagem da Opção (opcional)
                        <input type="file" name="opcoes_imagem[]" class="option-image-input" accept="image/jpeg, image/png, image/gif">
                    </label>
                    <div class="option-image-preview" style="display: ${imageUrl ? 'block' : 'none'};">
                        <img src="${imageUrl}" alt="Pré-visualização da imagem" style="max-width: 150px; height: auto; border-radius: 8px; margin-top: 5px;">
                    </div>
                </div>
            `;
            optionsContainer.appendChild(newOption);
            newOption.querySelector('.remove-option-btn')?.addEventListener('click', () => newOption.remove());
            newOption.querySelector('.option-image-input')?.addEventListener('change', function() {
                const file = this.files[0];
                const previewDiv = this.parentNode.nextElementSibling;
                const previewImage = previewDiv.querySelector('img');
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        previewImage.src = e.target.result;
                        previewDiv.style.display = 'block';
                    }
                    reader.readAsDataURL(file);
                } else {
                    previewDiv.style.display = 'none';
                    previewImage.src = '#';
                }
            });
        };
        const updateFormUI = () => {
            if (!optionsContainer || !tipoQuestaoSelect) return;
            optionsContainer.innerHTML = ''; optionCount = 0;
            if (tipoQuestaoSelect.value === 'DISCURSIVA') { if (addOptionWrapper) addOptionWrapper.style.display = 'none'; }
            else { if (addOptionWrapper) addOptionWrapper.style.display = 'block'; addOptionField(); addOptionField(); }
        };

        const handleGenerateWithAI = async () => {
            const tipo = tipoQuestaoSelect.value;
            const nivel = nivelDificuldadeSelect.value;
            const grau = grauEnsinoSelect.value;
            const area = document.getElementById('area_conhecimento')?.value || 'Conhecimentos Gerais';

            try {
                updateFormUI();
                enunciadoInput.value = '';
                showFlashMessage('Gerando questão com IA...', 'info');

                const response = await fetch('/generate_questao', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tipo, nivel, grau, area }),
                });

                if (!response.ok) {
                    throw new Error((await response.json()).error || 'Falha na comunicação com a IA.');
                }
                const data = await response.json();
                enunciadoInput.value = data.enunciado;

                if (data.opcoes && data.opcoes.length > 0) {
                    optionsContainer.innerHTML = '';
                    optionCount = 0;
                    data.opcoes.forEach(op => addOptionField(op.texto, op.is_correta));
                }
                showFlashMessage('Questão gerada com sucesso! Revise e salve.', 'success');
            } catch (error) {
                console.error("Erro ao gerar questão com IA:", error);
                showFlashMessage(`Erro ao gerar questão: ${error.message}`, 'error');
            }
        };

        tipoQuestaoSelect?.addEventListener('change', updateFormUI);
        addOptionBtn?.addEventListener('click', addOptionField);
        generateWithAIBtn?.addEventListener('click', handleGenerateWithAI);
        if (tipoQuestaoSelect) updateFormUI();
    };

    // ===================================
    // MÓDULO: SELEÇÃO E EXPORTAÇÃO
    // ===================================
    const setupSelectionAndExport = () => {
        const selectionActions = document.getElementById('selectionActions'), selectionCount = document.getElementById('selectionCount'), exportBtn = document.getElementById('exportBtn'), exportFormat = document.getElementById('exportFormat'), questionList = document.querySelector('.question-list');
        const selectedIds = new Set();
        const updateSelectionUI = () => {
            const count = selectedIds.size;
            if (selectionCount) selectionCount.textContent = `${count} questão${count !== 1 ? 's' : ''} selecionada${count !== 1 ? 's' : ''}`;
            if (selectionActions) selectionActions.classList.toggle('visible', count > 0);
        };
        questionList?.addEventListener('change', (event) => {
            const checkbox = event.target.closest('.question-checkbox');
            if (!checkbox) return;
            const id = checkbox.dataset.id, questionItem = checkbox.closest('.question-item');
            if (checkbox.checked) { selectedIds.add(id); questionItem?.classList.add('selected'); }
            else { selectedIds.delete(id); questionItem?.classList.remove('selected'); }
            updateSelectionUI();
        });
        exportBtn?.addEventListener('click', async () => {
            if (selectedIds.size === 0) return alert('Selecione pelo menos uma questão para exportar.');
            const format = exportFormat.value, ids = Array.from(selectedIds);
            try {
                const response = await fetch('/export_questoes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, format }) });
                if (!response.ok) throw new Error((await response.json()).error || 'Falha na exportação');
                const blob = await response.blob(), url = window.URL.createObjectURL(blob), a = document.createElement('a');
                a.style.display = 'none'; a.href = url;
                const disposition = response.headers.get('content-disposition');
                let filename = `questoes.${format}`;
                if (disposition) { const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition); if (match?.[1]) filename = match[1].replace(/['"]/g, ''); }
                a.download = filename; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url); a.remove();
            } catch (error) { showFlashMessage(`Erro ao exportar: ${error.message}`, 'error'); }
        });
    };

    // ===================================
    // MÓDULO: MODAL DE VISUALIZAÇÃO/EDIÇÃO
    // ===================================
    const setupQuestionModal = () => {
        const questionModalOverlay = document.getElementById('questionModalOverlay'), modalCloseBtn = document.getElementById('modalCloseBtn'), modalViewContent = document.getElementById('modalViewContent'), modalEditContent = document.getElementById('modalEditContent'), modalQuestionTitle = document.getElementById('modalQuestionTitle'), modalOptionsList = document.getElementById('modalOptionsList'), modalEditBtn = document.getElementById('modalEditBtn'), modalDeleteBtn = document.getElementById('modalDeleteBtn'), modalTags = document.getElementById('modalTags'), defaultFooterButtons = document.getElementById('defaultFooterButtons'), searchFooterButtons = document.getElementById('searchFooterButtons'), modalCancelBtn = document.getElementById('modalCancelBtn'), modalGoToQuestionBtn = document.getElementById('modalGoToQuestionBtn');
        const modalQuestionImageContainer = document.getElementById('modalQuestionImageContainer');
        const modalQuestionImage = document.getElementById('modalQuestionImage');

        const openModal = async (questionId, context = 'default') => {
            try {
                if (!questionModalOverlay) return;
                if (defaultFooterButtons && searchFooterButtons) {
                    if (context === 'search-result') {
                        defaultFooterButtons.style.display = 'none';
                        searchFooterButtons.style.display = 'flex';
                    } else {
                        defaultFooterButtons.style.display = 'flex';
                        searchFooterButtons.style.display = 'none';
                    }
                }
                const response = await fetch(`/get_questao/${questionId}`);
                if (!response.ok) throw new Error('Falha ao buscar detalhes da questão.');
                currentQuestionData = await response.json();
                switchToViewMode();
                if (modalQuestionTitle) modalQuestionTitle.textContent = `#${currentQuestionData.id}: ${currentQuestionData.enunciado || ''}`;

                // Exibe ou esconde a imagem do enunciado no modal
                if (currentQuestionData.imagem_url) {
                    modalQuestionImage.src = currentQuestionData.imagem_url;
                    modalQuestionImageContainer.style.display = 'block';
                } else {
                    modalQuestionImageContainer.style.display = 'none';
                }

                if (modalTags) {
                    const nivel = currentQuestionData.nivel_dificuldade || 'desconhecido';
                    let tagsHTML = `<span class="tag tag-${nivel.toLowerCase().replace(' ', '_')}">${nivel.replace('_', ' ')}</span>`;
                    if (currentQuestionData.grau_ensino) {
                        tagsHTML += ` <span class="tag tag-grau">${currentQuestionData.grau_ensino}</span>`;
                    }
                    if (currentQuestionData.area_conhecimento) {
                        tagsHTML += ` <span class="tag tag-area">${currentQuestionData.area_conhecimento}</span>`;
                    }
                    modalTags.innerHTML = tagsHTML;
                }

                if (modalOptionsList) {
                    modalOptionsList.innerHTML = '';
                    if (Array.isArray(currentQuestionData.opcoes) && currentQuestionData.opcoes.length > 0) {
                        currentQuestionData.opcoes.forEach(op => {
                            const li = document.createElement('li');
                            if (op.imagem_url) {
                                li.innerHTML = `<img src="${op.imagem_url}" alt="Opção" style="max-width: 100px; max-height: 100px;">`;
                            }
                            if (op.texto_opcao) {
                                li.innerHTML += `<p>${op.texto_opcao}</p>`;
                            }
                            if (op.is_correta) {
                                li.classList.add('correct');
                            }
                            modalOptionsList.appendChild(li);
                        });
                    } else if (currentQuestionData.tipo_questao === 'DISCURSIVA') {
                        modalOptionsList.innerHTML = '<li>Questão discursiva não possui opções.</li>';
                    } else {
                        modalOptionsList.innerHTML = '<li>Não há opções para exibir.</li>';
                    }
                }
                if (modalDeleteBtn) modalDeleteBtn.dataset.id = questionId;
                if (modalEditBtn) modalEditBtn.dataset.id = questionId;
                if (modalGoToQuestionBtn) modalGoToQuestionBtn.dataset.id = questionId;
                questionModalOverlay.classList.add('open');
            } catch (error) {
                console.error("Erro ao abrir modal:", error);
                showFlashMessage(error.message, 'error');
            }
        };

        const closeModal = () => { if (questionModalOverlay) { questionModalOverlay.classList.remove('open'); setTimeout(switchToViewMode, 300); } };

        const switchToEditMode = () => {
            if (!modalViewContent || !modalEditContent || !currentQuestionData) return;
            modalViewContent.style.display = 'none';
            modalEditContent.style.display = 'block';

            let optionsHTML = '';
            let optionCount = 0;
            if (currentQuestionData.tipo_questao !== 'DISCURSIVA' && Array.isArray(currentQuestionData.opcoes)) {
                const inputType = currentQuestionData.tipo_questao === 'ESCOLHA_UNICA' ? 'radio' : 'checkbox';
                currentQuestionData.opcoes.forEach((opcao, index) => {
                    const isChecked = opcao.is_correta ? 'checked' : '';
                    const optionText = opcao.texto_opcao || '';
                    const optionImage = opcao.imagem_url || '';
                    optionCount++;
                    optionsHTML += `
                        <div class="form-group dynamic-option">
                            <label>Opção ${String.fromCharCode(64 + optionCount)}</label>
                            <div class="option-input-group">
                                <input type="text" name="opcoes_texto[]" value="${optionText}" placeholder="Texto da opção">
                                <label class="correct-answer-label">
                                    <input type="${inputType}" name="respostas_corretas[]" value="${index}" ${isChecked}>
                                    <span>Correta?</span>
                                </label>
                                <button type="button" class="remove-option-btn">&times;</button>
                            </div>
                            <div class="option-image-group">
                                <label>
                                    Imagem da Opção (opcional)
                                    <input type="file" name="opcoes_imagem[]" class="option-image-input" accept="image/jpeg, image/png, image/gif">
                                </label>
                                <div class="option-image-preview" style="display: ${optionImage ? 'block' : 'none'};">
                                    <img src="${optionImage}" alt="Pré-visualização da imagem" style="max-width: 150px; height: auto; border-radius: 8px; margin-top: 5px;">
                                </div>
                            </div>
                        </div>
                    `;
                });
            }

            modalEditContent.innerHTML = `
                <form id="editQuestionForm" action="/edit_questao/${currentQuestionData.id}" method="POST" enctype="multipart/form-data">
                    <div class="form-group"><label>Enunciado</label><textarea name="enunciado" rows="4" required>${currentQuestionData.enunciado || ''}</textarea></div>
                    <div class="form-group">
                        <label for="imagem_edit">Anexar Nova Imagem (opcional)</label>
                        <input type="file" name="imagem" id="imagem_edit" accept="image/jpeg, image/png, image/gif">
                        <div id="imageEditPreview" style="margin-top: 10px;">
                            ${currentQuestionData.imagem_url ? `<img id="previewEditImg" src="${currentQuestionData.imagem_url}" alt="Imagem atual" style="max-width: 100%; height: auto; border-radius: 8px;">` : 'Nenhuma imagem atual.'}
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label>Nível de Dificuldade</label><select name="nivel_dificuldade" required><option value="FACIL" ${currentQuestionData.nivel_dificuldade === 'Fácil' ? 'selected' : ''}>Fácil</option><option value="MEDIO" ${currentQuestionData.nivel_dificuldade === 'Médio' ? 'selected' : ''}>Médio</option><option value="DIFICIL" ${currentQuestionData.nivel_dificuldade === 'Difícil' ? 'selected' : ''}>Difícil</option><option value="MUITO_DIFICIL" ${currentQuestionData.nivel_dificuldade === 'Muito Difícil' ? 'selected' : ''}>Muito Difícil</option></select></div>
                        <div class="form-group"><label>Grau de Ensino</label><input type="text" name="grau_ensino" value="${currentQuestionData.grau_ensino || ''}" placeholder="Ex: Ensino Médio"></div>
                    </div>
                    <div class="form-group">
                        <label>Área de Conhecimento</label>
                        <input type="text" name="area_conhecimento" value="${currentQuestionData.area_conhecimento || ''}" placeholder="Ex: Matemática, Biologia, História">
                    </div>
                    <input type="hidden" name="tipo_questao" value="${currentQuestionData.tipo_questao}">
                    <div id="editOptionsContainer">${optionsHTML}</div>
                    <button type="button" id="addEditOptionBtn" class="secondary-btn">Adicionar Opção</button>
                    <div class="modal-footer"><button type="button" class="secondary-btn" id="cancelEditBtn">Cancelar</button><button type="submit" class="submit-btn">Salvar Alterações</button></div>
                </form>`;

            document.getElementById('addEditOptionBtn')?.addEventListener('click', () => addOptionField('', false, '', 'edit'));
            document.getElementById('editOptionsContainer')?.addEventListener('click', (event) => {
                if (event.target.classList.contains('remove-option-btn')) {
                    event.target.closest('.dynamic-option').remove();
                }
            });

            const editQuestionForm = document.getElementById('editQuestionForm');
            editQuestionForm?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(editQuestionForm);
                try {
                    const response = await fetch(editQuestionForm.action, {
                        method: 'POST',
                        body: formData,
                    });

                    const html = await response.text();
                    const newDoc = new DOMParser().parseFromString(html, 'text/html');
                    const flashMessage = newDoc.querySelector('.flash-message');
                    if (flashMessage) {
                        showFlashMessage(flashMessage.textContent, flashMessage.classList.contains('success') ? 'success' : 'error');
                    }

                    if (response.ok) {
                        window.location.href = newDoc.URL;
                    }
                } catch (error) {
                    console.error("Erro ao enviar formulário de edição:", error);
                    showFlashMessage('Erro de conexão. Tente novamente.', 'error');
                }
            });

            const imagemEditInput = document.getElementById('imagem_edit');
            const previewEditImg = document.getElementById('previewEditImg');
            if (imagemEditInput && previewEditImg) {
                imagemEditInput.addEventListener('change', function() {
                    const file = this.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            previewEditImg.src = e.target.result;
                        }
                        reader.readAsDataURL(file);
                    }
                });
            }

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
                if (!response.ok) throw new Error((await response.json()).error || 'Falha ao excluir.');
                location.reload();
            } catch (error) { showFlashMessage(error.message, 'error'); }
        };

        document.body.addEventListener('click', async (event) => {
            const target = event.target;
            const questionItem = target.closest('.question-item');
            if (questionItem && !target.closest('.question-checkbox, .delete-btn, .restore-btn, .perm-delete-btn, a')) {
                const questionId = questionItem.dataset.id;
                const context = questionItem.dataset.context;
                if (questionId) openModal(questionId, context);
            }
            const deleteBtn = target.closest('.delete-btn:not(.modal-delete-btn)');
            if (deleteBtn) handleDeleteQuestion(deleteBtn.dataset.id);
            const restoreBtn = target.closest('.restore-btn');
            if (restoreBtn) {
                try {
                    const response = await fetch(`/restore_questao/${restoreBtn.dataset.id}`, { method: 'POST' });
                    if (!response.ok) throw new Error((await response.json()).error || 'Falha ao restaurar.');
                    location.reload();
                } catch (error) { showFlashMessage(error.message, 'error'); }
            }
            const permDeleteBtn = target.closest('.perm-delete-btn');
            if (permDeleteBtn) {
                if (!confirm(`EXCLUSÃO PERMANENTE: Deseja apagar a questão #${permDeleteBtn.dataset.id} para sempre?`)) return;
                try {
                    const response = await fetch(`/delete_permanently/${permDeleteBtn.dataset.id}`, { method: 'POST' });
                    if (!response.ok) throw new Error((await response.json()).error || 'Falha ao excluir permanentemente.');
                    location.reload();
                } catch (error) { showFlashMessage(error.message, 'error'); }
            }
        });

        modalCancelBtn?.addEventListener('click', closeModal);
        modalGoToQuestionBtn?.addEventListener('click', () => {
            const questionId = modalGoToQuestionBtn.dataset.id;
            if (questionId) {
                window.location.href = `/banco_questoes#questao-${questionId}`;
            }
        });

        modalEditBtn?.addEventListener('click', switchToEditMode);
        modalDeleteBtn?.addEventListener('click', () => { if (modalDeleteBtn.dataset.id) { handleDeleteQuestion(modalDeleteBtn.dataset.id); closeModal(); } });
        modalCloseBtn?.addEventListener('click', closeModal);
        questionModalOverlay?.addEventListener('click', e => { if (e.target === questionModalOverlay) closeModal(); });
    };

    // ===================================
    // MÓDULO: CHAT COM IA
    // ===================================
    const setupAIChat = () => {
        const chatForm = document.getElementById('chat-form');
        const chatInput = document.getElementById('chat-input');
        const chatMessages = document.getElementById('chat-messages');
        if (!chatForm || !chatInput || !chatMessages) return;

        let conversationHistory = [];

        const addMessage = (sender, message) => {
            const messageElement = document.createElement('div');
            // ATUALIZAÇÃO: usa innerHTML para renderizar markdown como **negrito**
            messageElement.classList.add(sender === 'user' ? 'user-message' : 'ai-message');
            // Simples substituição de markdown para negrito
            const formattedMessage = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            messageElement.innerHTML = formattedMessage.replace(/\n/g, '<br>');
            chatMessages.appendChild(messageElement);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        };

        chatForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const userMessage = chatInput.value.trim();
            if (!userMessage) return;

            addMessage('user', userMessage);
            chatInput.value = '';

            const typingIndicator = document.createElement('div');
            typingIndicator.classList.add('ai-message', 'typing');
            typingIndicator.textContent = 'Digitando...';
            chatMessages.appendChild(typingIndicator);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: userMessage }),
                });

                chatMessages.removeChild(typingIndicator);

                if (!response.ok) {
                    throw new Error('Erro na comunicação com a IA.');
                }

                const data = await response.json();
                addMessage('ai', data.message);

            } catch (error) {
                console.error('Erro no chat com IA:', error);
                const typingIndicator = chatMessages.querySelector('.typing');
                if(typingIndicator) chatMessages.removeChild(typingIndicator);
                addMessage('ai', 'Desculpe, ocorreu um erro. Tente novamente.');
            }
        });
    };

    // ===================================
    // INICIALIZAÇÃO DE TODOS OS MÓDUTOS
    // ===================================
    setupThemeToggler();
    setupLoginForm();
    setupProfilePhotoUpload();
    setupMenu();
    setupInteractiveSearch();
    setupQuestionForm();
    setupSelectionAndExport();
    setupQuestionModal();
    setupAIChat();
});