document.addEventListener('DOMContentLoaded', () => {
    const likeButtons = document.querySelectorAll('.like-btn');

    likeButtons.forEach(button => {
        button.addEventListener('click', async () => {
            const blogId = button.dataset.blogId;
            if (!blogId) {
                console.error('Error: Blog ID not found for like button.');
                return;
            }

            try {
                const response = await fetch(`/blogs/${blogId}/like`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    credentials: 'include'
                });

                const contentType = response.headers.get("content-type") || "";
                const isJson = contentType.includes('application/json');

                const responseBody = isJson
                    ? await response.json()
                    : await response.text();

                if (!response.ok) {
                    if (response.status === 401) {
                        const loginModal = new bootstrap.Modal(document.getElementById('loginModal'));
                        loginModal.show();
                        return;
                    }

                    console.error('Error response:', responseBody);
                    alert(`Error: ${responseBody.error || 'Something went wrong.'}`);
                    return;
                }

                // Safe to access parsed JSON
                const data = responseBody;

                if (data.success) {
                    // Update like count
                    const likeCountElement = button.querySelector('.like-count-display');
                    if (likeCountElement) {
                        likeCountElement.textContent = data.data.likeCount;
                    }

                    // Toggle heart icon
                    const heartIcon = button.querySelector('.bi');
                    if (data.data.isLiked) {
                        button.classList.add('text-danger');
                        heartIcon.classList.replace('bi-heart', 'bi-heart-fill');
                    } else {
                        button.classList.remove('text-danger');
                        heartIcon.classList.replace('bi-heart-fill', 'bi-heart');
                    }

                } else {
                    alert(`Error: ${data.error || 'Unknown error'}`);
                }

            } catch (error) {
                console.error('Error during like request:', error);
                alert(`An error occurred: ${error.message}`);
            }
        });
    });
});
  