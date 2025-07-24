document.addEventListener('DOMContentLoaded', () => {
    // Like button logic for comments and replies
    document.querySelectorAll('.comment-like-btn').forEach(btn => {
        // Prevent duplicate bindings
        if (btn._likeHandlerAttached) return;

        const handler = async function () {
            const commentId = this.dataset.commentId;

            try {
                const response = await fetch(`/blogs/comments/${commentId}/like`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });

                const data = await response.json();
                if (data.success) {
                    const icon = this.querySelector('i');
                    const count = this.querySelector('.comment-like-count');

                    // Update icon and count
                    icon.className = `bi ${data.isLiked ? 'bi-heart-fill' : 'bi-heart'}`;
                    count.textContent = data.likeCount;

                    // Reflect new state
                    this.dataset.isLiked = data.isLiked.toString();
                    this.classList.toggle('liked', data.isLiked);
                }
            } catch (err) {
                console.error('Error toggling like:', err);
            }
        };

        btn.addEventListener('click', handler);
        btn._likeHandlerAttached = true;
    });

    // Reply button toggle
    document.querySelectorAll('.comment-reply-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const commentId = this.dataset.commentId;
            const form = document.getElementById(`reply-form-${commentId}`);
            const isVisible = form.style.display === 'block';
            form.style.display = isVisible ? 'none' : 'block';
            if (!isVisible) form.querySelector('textarea').focus();
        });
    });

    // Cancel reply
    document.querySelectorAll('.cancel-reply').forEach(btn => {
        btn.addEventListener('click', function () {
            const commentId = this.dataset.commentId;
            const form = document.getElementById(`reply-form-${commentId}`);
            if (form) form.style.display = 'none';
        });
    });

    // Reply form submission
    document.querySelectorAll('.reply-form form').forEach(form => {
        form.addEventListener('submit', async function (e) {
            e.preventDefault();

            const content = this.querySelector('textarea[name="content"]').value;
            const parentCommentId = this.querySelector('input[name="parentCommentId"]')?.value;

            const payload = {
                content,
                ...(parentCommentId && { parentCommentId })
            };

            try {
                const response = await fetch(this.action, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    window.location.reload();
                } else {
                    alert('Failed to post reply.');
                }
            } catch (err) {
                console.error('Error submitting reply:', err);
            }
        });
    });
});
